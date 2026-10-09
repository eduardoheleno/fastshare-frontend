import { useCallback, useEffect, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";
import { acknowledge, mergeMessages, request } from "./chat.js";

export function useRoom(roomId, identity) {
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState("connecting");
  const [connectionId, setConnectionId] = useState("");
  const [error, setError] = useState("");
  const pendingKey = `fastshare:pending:${roomId}:${identity.participantId}`;
  const [pending, setPending] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(pendingKey) || "[]");
    } catch {
      return [];
    }
  });
  const pendingRef = useRef(pending);
  const clientRef = useRef(null);
  const ready = useRef(false);
  const onSignal = useRef(() => {});

  useEffect(() => {
    pendingRef.current = pending;
    sessionStorage.setItem(pendingKey, JSON.stringify(pending));
  }, [pending, pendingKey]);

  const send = useCallback((destination, body = {}) => {
    if (!ready.current || !clientRef.current?.connected) return false;
    clientRef.current.publish({
      destination: `/app/${destination}`,
      body: JSON.stringify(body),
    });
    return true;
  }, []);

  useEffect(() => {
    let disposed = false;
    let cursor = 0;
    let syncing = false;
    let initialSyncDone = false;
    const applyState = (event) => {
      if (event.type === "leave") {
        setMembers((current) =>
          current.filter((member) => member.connectionId !== event.connectionId),
        );
        return;
      }
      if (event.type !== "member" || !event.member) return;
      setMembers((current) => {
        const index = current.findIndex(
          (member) => member.connectionId === event.member.connectionId,
        );
        if (index < 0) return [...current, event.member];
        return current.map((member, position) =>
          position === index ? { ...member, ...event.member } : member,
        );
      });
    };
    let receiptTimer;
    const accept = (incoming) => {
      if (disposed) return;
      setMessages((current) => mergeMessages(current, incoming));
      setPending((current) =>
        acknowledge(current, incoming, identity.participantId),
      );
    };
    const client = new Client({
      brokerURL:
        import.meta.env.VITE_WS_URL ||
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      reconnectDelay: 3000,
      connectionTimeout: 10000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      beforeConnect: () => {
        ready.current = false;
        const id = crypto.randomUUID();
        client.connectHeaders = {
          room: roomId,
          token: identity.token,
          "connection-id": id,
        };
        setConnectionId(id);
        setStatus("connecting");
      },
      onConnect: () => {
        let receipts = 0;
        const subscribed = () => {
          if (++receipts !== 2 || disposed) return;
          clearTimeout(receiptTimer);
          ready.current = true;
          setStatus("connected");
          setError("");
          send("heartbeat");
          for (const message of pendingRef.current)
            if (!message.failed) send("chat", message);
          if (!initialSyncDone) {
            initialSyncDone = true;
            sync();
          }
        };
        const subscribe = (destination, callback) => {
          const receipt = crypto.randomUUID();
          client.watchForReceipt(receipt, subscribed);
          client.subscribe(destination, callback, { receipt, ack: "auto" });
        };
        receiptTimer = setTimeout(() => client.forceDisconnect(), 10000);
        subscribe(`/topic/room.${roomId}.chat`, (frame) => {
          const event = JSON.parse(frame.body);
          if (event.type === "member" || event.type === "leave") applyState(event);
          else accept([event]);
        });
        subscribe(
          `/topic/room.${roomId}.signal.${client.connectHeaders["connection-id"]}`,
          (frame) => {
            const event = JSON.parse(frame.body);
            if (event.type === "error") {
              setError(event.message);
              if (event.message === "Limite de mensagens atingido.") {
                setPending((current) =>
                  current.map((message) => ({ ...message, failed: true })),
                );
              }
              if (event.message.includes("Conexão expirada"))
                client.forceDisconnect();
            } else onSignal.current(event);
          },
        );
      },
      onWebSocketClose: () => {
        ready.current = false;
        clearTimeout(receiptTimer);
        if (!disposed) setStatus("reconnecting");
      },
      onStompError: (frame) =>
        setError(
          frame.headers.message ||
            "Não foi possível entrar. A sala pode estar lotada.",
        ),
      onWebSocketError: () =>
        setError("Conexão interrompida. Tentando reconectar…"),
    });
    clientRef.current = client;

    async function sync() {
      if (syncing || disposed) return;
      syncing = true;
      try {
        let more;
        do {
          const state = await request(`/api/rooms/${roomId}?after=${cursor}`, {
            headers: { Authorization: `Bearer ${identity.token}` },
          });
          if (disposed) return;
          setMembers(Array.isArray(state.members) ? state.members : []);
          const batch = Array.isArray(state.messages) ? state.messages : [];
          accept(batch);
          if (batch.length) cursor = batch.at(-1).seq;
          more = cursor < state.total && batch.length > 0;
        } while (more && !disposed);
      } catch (failure) {
        if (disposed) return;
        setError(failure.message);
        if ([401, 404].includes(failure.status)) {
          disposed = true;
          ready.current = false;
          setStatus("expired");
          client.deactivate();
        }
      } finally {
        syncing = false;
      }
    }

    client.activate();
    const heartbeat = setInterval(() => {
      send("heartbeat");
      for (const message of pendingRef.current)
        if (!message.failed) send("chat", message);
    }, 10000);
    return () => {
      disposed = true;
      ready.current = false;
      clearTimeout(receiptTimer);
      clearInterval(heartbeat);
      client.deactivate();
    };
  }, [roomId, identity, send]);

  const submit = (text) => {
    const message = { clientId: crypto.randomUUID(), text: text.trim() };
    if (!message.text) return false;
    if (pendingRef.current.length >= 50) {
      setError("Aguarde o envio das mensagens pendentes antes de continuar.");
      return false;
    }
    setPending((current) => [...current, message]);
    send("chat", message);
    return true;
  };

  return {
    messages,
    members,
    pending,
    status,
    error,
    connectionId,
    submit,
    send,
    onSignal,
  };
}
