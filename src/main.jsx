import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { request } from "./chat.js";
import { useRoom } from "./useRoom.js";
import { ScreenPeers } from "./ScreenPeers.js";
import "./style.css";

const roomId = location.pathname.match(/^\/r\/([0-9a-f-]{36})$/)?.[1];

function Video({ stream, muted }) {
  const element = useRef(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const video = element.current;
    video.srcObject = stream;
    if (stream)
      video
        .play()
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true));
    return () => {
      video.srcObject = null;
    };
  }, [stream]);
  return (
    <>
      <video
        ref={element}
        autoPlay
        playsInline
        controls
        muted={muted}
        aria-label="Transmissão selecionada"
      />
      {blocked && (
        <button
          className="play"
          onClick={() =>
            element.current
              .play()
              .then(() => setBlocked(false))
              .catch(() => {})
          }
        >
          Reproduzir vídeo e áudio
        </button>
      )}
    </>
  );
}

function Room({ identity }) {
  const room = useRoom(roomId, identity);
  const [media, setMedia] = useState({
    local: null,
    remote: null,
    status: "Escolha uma tela para assistir.",
  });
  const [selected, setSelected] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const peers = useRef(null);
  const end = useRef(null);
  const connected = room.status === "connected";

  useEffect(() => {
    if (!connected) return;
    let disposed = false;
    let instance;
    let advertise;
    request(`/api/rooms/${roomId}/ice`, {
      headers: { Authorization: `Bearer ${identity.token}` },
    })
      .then(({ iceServers }) => {
        if (disposed) return;
        instance = new ScreenPeers(
          room.send,
          (patch) => setMedia((current) => ({ ...current, ...patch })),
          iceServers,
        );
        peers.current = instance;
        room.onSignal.current = (event) => instance.receive(event);
        advertise = setInterval(() => {
          if (instance.local) room.send("share", { sharing: true });
        }, 10000);
    })
      .catch((error) => {
        if (!disposed) setMediaError(error.message);
      });
    return () => {
      disposed = true;
      clearInterval(advertise);
      instance?.destroy();
      if (peers.current === instance) peers.current = null;
      room.onSignal.current = () => {};
      setSelected("");
    };
  }, [connected, room.connectionId, room.send, room.onSignal]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [room.messages.length, room.pending.length]);

  async function share() {
    setMediaError("");
    setCapturing(true);
    try {
      await peers.current.start();
    } catch (error) {
      setMediaError(
        error.name === "NotAllowedError"
          ? "Compartilhamento cancelado ou não autorizado pelo navegador."
          : error.message,
      );
    } finally {
      setCapturing(false);
    }
  }

  function select(member) {
    setSelected(member.connectionId);
    if (member.connectionId === room.connectionId) {
      if (peers.current.watching)
        peers.current.close(peers.current.watching, true);
      setMedia((current) => ({
        ...current,
        remote: null,
        status: "Prévia da sua tela — áudio silenciado",
      }));
    } else peers.current.watch(member.connectionId);
  }

  const presenters = room.members.filter((member) => member.sharing);
  const isLocal = selected === room.connectionId;
  const stream = connected ? (isLocal ? media.local : media.remote) : null;
  const selectedPerson = room.members.find(
    (member) => member.connectionId === selected,
  );

  return (
    <main className="room-shell">
      <header className="topbar">
        <a className="brand" href="/">
          fastshare<span>●</span>
        </a>
        <div className="room-label">
          SALA TEMPORÁRIA <strong>{roomId.slice(0, 8)}</strong>
        </div>
        <span
          className={`connection ${connected ? "online" : ""}`}
          role="status"
        >
          {connected
            ? "Conectado"
            : room.status === "expired"
              ? "Sala indisponível"
              : "Reconectando…"}
        </span>
        <button
          className="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setMediaError(
                "Copie o link pela barra de endereço do navegador.",
              );
            }
          }}
        >
          {copied ? "Link copiado" : "Copiar convite"}
        </button>
        <a className="leave" href="/">
          Sair
        </a>
      </header>
      {(room.error || mediaError) && (
        <div className="notice" role="alert">
          {mediaError || room.error}
        </div>
      )}
      <div className="workspace">
        <section className="screen-panel" aria-label="Compartilhamento de tela">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">AO VIVO, ENTRE VOCÊS</span>
              <h1>
                {selectedPerson
                  ? `Tela de ${selectedPerson.name}`
                  : "Um espaço para compartilhar."}
              </h1>
            </div>
            <button
              disabled={!connected || capturing || !peers.current}
              onClick={media.local ? () => peers.current.stopSharing() : share}
            >
              {capturing
                ? "Escolhendo…"
                : media.local
                  ? "Parar minha transmissão"
                  : "Compartilhar minha tela"}
            </button>
          </div>
          <div className={`stage ${stream ? "has-video" : ""}`}>
            {stream ? (
              <Video stream={stream} muted={isLocal} />
            ) : (
              <div className="empty-stage">
                <span className="screen-icon" aria-hidden="true">
                  ▱
                </span>
                <h2>
                  {selected
                    ? "Aguardando a transmissão"
                    : "O que vamos ver hoje?"}
                </h2>
                <p>
                  {connected
                    ? media.status
                    : "Reconectando à sala. As transmissões precisarão ser selecionadas novamente."}
                </p>
                {selected && connected && selectedPerson?.sharing && (
                  <button
                    className="secondary"
                    onClick={() => select(selectedPerson)}
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="screen-status" aria-live="polite">
            {media.status}
            {media.local && (
              <span>
                {media.local.getAudioTracks().length
                  ? "Sua tela está enviando áudio."
                  : "Sua tela está sem áudio: a fonte ou o navegador não o disponibilizou."}
              </span>
            )}
          </div>
          <div className="presenters">
            <h2>
              Telas disponíveis <span>{presenters.length}</span>
            </h2>
            <div className="presenter-list">
              {presenters.length === 0 && (
                <p className="muted">
                  Ninguém está apresentando. Você pode ser o primeiro.
                </p>
              )}
              {presenters.map((member) => (
                <button
                  className={`presenter ${selected === member.connectionId ? "selected" : ""}`}
                  key={member.connectionId}
                  disabled={!connected || !peers.current}
                  onClick={() => select(member)}
                >
                  <span className="avatar">
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    {member.name}
                    <small>
                      {member.connectionId === room.connectionId
                        ? "Sua transmissão"
                        : "Vídeo + áudio disponível na fonte"}
                    </small>
                  </span>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
          <div className="participants">
            <h2>
              Na sala <span>{room.members.length}/10</span>
            </h2>
            <div>
              {room.members.map((member) => (
                <span key={member.connectionId} className="person">
                  {member.name}
                  {member.id === identity.participantId ? " (você)" : ""}
                </span>
              ))}
            </div>
          </div>
        </section>
        <aside className="chat-panel" aria-label="Chat da sala">
          <div className="chat-heading">
            <h2>Conversa</h2>
            <span>Todos na sala</span>
          </div>
          <div
            className="messages"
            role="log"
            aria-label="Mensagens"
            aria-live="polite"
          >
            {!room.messages.length && (
              <div className="chat-empty">
                <h3>Comece a conversa</h3>
                <p>
                  Quem entrar depois também poderá ler o histórico desta sala.
                </p>
              </div>
            )}
            {room.messages.map((message) => (
              <article
                className={`message ${message.participantId === identity.participantId ? "own" : ""}`}
                key={message.seq}
              >
                <div>
                  <strong>{message.name}</strong>
                  <time>
                    {new Date(message.sentAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p>{message.text}</p>
              </article>
            ))}
            {room.pending.map((message) => (
              <article className="message pending" key={message.clientId}>
                <strong>
                  {message.failed
                    ? "Não enviada — limite da sala atingido"
                    : "Você · aguardando confirmação"}
                </strong>
                <p>{message.text}</p>
              </article>
            ))}
            <div ref={end} />
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              if (room.submit(draft)) setDraft("");
            }}
          >
            <label htmlFor="message" className="sr-only">
              Mensagem para a sala
            </label>
            <textarea
              id="message"
              rows="2"
              maxLength="2000"
              value={draft}
              disabled={room.status === "expired"}
              placeholder="Escreva para a sala…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  if (draft.trim() && room.submit(draft)) setDraft("");
                }
              }}
            />
            <div>
              <small>Enter envia · Shift + Enter quebra linha</small>
              <button disabled={!draft.trim() || room.status === "expired"}>
                Enviar
              </button>
            </div>
          </form>
        </aside>
      </div>
      <footer>
        Sem gravação de tela. A sala e o histórico expiram após 15 minutos sem
        participantes.
      </footer>
    </main>
  );
}

function App() {
  const storageKey = `fastshare:identity:${roomId}`;
  const [identity, setIdentity] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (roomId && identity) return <Room identity={identity} />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const id = roomId || (await request("/api/rooms", { method: "POST" })).id;
      const result = await request(`/api/rooms/${id}/join`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      sessionStorage.setItem(
        `fastshare:identity:${id}`,
        JSON.stringify(result),
      );
      if (roomId) setIdentity(result);
      else location.assign(`/r/${id}`);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <nav>
        <a className="brand" href="/">
          fastshare<span>●</span>
        </a>
        <span>Uma conversa. Um link. Sua tela.</span>
      </nav>
      <section className="hero">
        <div>
          <span className="eyebrow">MENOS DISTÂNCIA, MAIS IDEIAS</span>
          <h1>
            Sua tela.
            <br />
            Nossa conversa.
          </h1>
          <p>
            Abra uma sala, compartilhe o link e veja as ideias acontecerem. Sem
            cadastro, sem câmera, sem complicação.
          </p>
          <div className="features">
            <span>↗ Telas compartilhadas</span>
            <span>◎ Chat em tempo real</span>
            <span>◷ Salas temporárias</span>
          </div>
        </div>
        <form className="join-card" onSubmit={submit}>
          <span className="card-mark" aria-hidden="true">
            ↗
          </span>
          <h2>{roomId ? "Seu lugar está aqui." : "Vamos compartilhar?"}</h2>
          <p>
            {roomId
              ? "Escolha como quer aparecer para as outras pessoas."
              : "Comece pelo seu nome. O link do convite vem depois."}
          </p>
          <label htmlFor="name">Seu nome</label>
          <input
            id="name"
            autoComplete="nickname"
            autoFocus
            required
            maxLength="40"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Como podemos chamar você?"
          />
          <button disabled={busy || !name.trim()}>
            {busy
              ? "Preparando…"
              : roomId
                ? "Entrar na sala →"
                : "Criar uma sala →"}
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <small>
            Quem tiver o link pode entrar e ler a conversa. A sala expira após
            15 minutos vazia.
          </small>
        </form>
      </section>
      <footer>Feito para compartilhar o momento.</footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
