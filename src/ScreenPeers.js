export class ScreenPeers {
  constructor(send, update, iceServers = []) {
    this.send = send;
    this.update = update;
    this.calls = new Map();
    this.local = null;
    this.watching = null;
    this.disposed = false;
    const stunUrl = import.meta.env.VITE_STUN_URL;
    this.iceServers = [
      ...(stunUrl ? [{ urls: stunUrl }] : []),
      ...iceServers,
    ];
  }

  signal(target, callId, kind, data = null) {
    return this.send("signal", { target, callId, kind, data });
  }

  async start() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error(
        "Este navegador não permite capturar a tela aqui. Use um computador em localhost ou HTTPS.",
      );
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 10, max: 15 }, width: { ideal: 1920 } },
      audio: true,
    });
    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.local = stream;
    stream.getVideoTracks()[0].onended = () => this.stopSharing();
    this.update({ local: stream });
    this.send("share", { sharing: true });
  }

  stopSharing() {
    for (const [id, call] of this.calls)
      if (call.outgoing) this.close(id, true);
    this.local?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.local = null;
    this.send("share", { sharing: false });
    this.update({ local: null });
  }

  create(id, remote, outgoing) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const call = {
      pc,
      remote,
      outgoing,
      candidates: [],
      timer: null,
      disconnectTimer: null,
    };
    this.calls.set(id, call);
    call.timer = setTimeout(() => this.fail(id), 20000);
    pc.onicecandidate = (event) => {
        console.log(event);
      if (event.candidate)
        this.signal(remote, id, "ice", event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        clearTimeout(call.timer);
        clearTimeout(call.disconnectTimer);
        if (!outgoing) this.update({ status: "Transmissão conectada" });
      } else if (pc.connectionState === "failed") this.fail(id);
      else if (pc.connectionState === "disconnected") {
        clearTimeout(call.disconnectTimer);
        call.disconnectTimer = setTimeout(() => this.fail(id), 5000);
      }
    };
    if (!outgoing) {
      const stream = new MediaStream();
      pc.ontrack = (event) => {
        stream.addTrack(event.track);
        this.update({ remote: stream });
      };
    }
    return call;
  }

  watch(remote) {
    if (this.watching) this.close(this.watching, true);
    this.update({ remote: null, status: "Conectando à transmissão…" });
    const id = crypto.randomUUID();
    this.watching = id;
    this.create(id, remote, false);
    this.signal(remote, id, "watch");
  }

  async receive(event) {
    const { callId: id, from, kind, data } = event;
    if (this.disposed) return;
    try {
      if (kind === "watch") {
        if (!this.local) return;
        for (const [existing, call] of this.calls) {
          if (call.outgoing && call.remote === from)
            this.close(existing, false);
        }
        const call = this.create(id, from, true);
        this.local
          .getTracks()
          .forEach((track) => call.pc.addTrack(track, this.local));
        await call.pc.setLocalDescription(await call.pc.createOffer());
        if (this.calls.has(id))
          this.signal(from, id, "offer", call.pc.localDescription.toJSON());
        return;
      }
      const call = this.calls.get(id);
      if (!call || call.remote !== from) return;
      if (kind === "stop") {
        this.close(id, false);
        if (!call.outgoing)
          this.update({ remote: null, status: "A transmissão foi encerrada." });
        return;
      }
      if (kind === "ice") {
        if (call.pc.remoteDescription) await call.pc.addIceCandidate(data);
        else call.candidates.push(data);
        return;
      }
      if (
        (kind === "offer" && !call.outgoing && id === this.watching) ||
        (kind === "answer" && call.outgoing)
      ) {
        await call.pc.setRemoteDescription(data);
        for (const candidate of call.candidates)
          await call.pc.addIceCandidate(candidate);
        call.candidates = [];
        if (kind === "offer") {
          await call.pc.setLocalDescription(await call.pc.createAnswer());
          if (this.calls.has(id))
            this.signal(from, id, "answer", call.pc.localDescription.toJSON());
        }
      }
    } catch {
      this.fail(id);
    }
  }

  fail(id) {
    const call = this.calls.get(id);
    if (!call) return;
    this.close(id, true);
    if (!call.outgoing)
      this.update({
        remote: null,
        status:
          "Não foi possível conectar diretamente. Tente novamente ou escolha outra tela.",
      });
  }

  close(id, notify) {
    const call = this.calls.get(id);
    if (!call) return;
    this.calls.delete(id);
    clearTimeout(call.timer);
    clearTimeout(call.disconnectTimer);
    call.pc.onconnectionstatechange = null;
    call.pc.onicecandidate = null;
    call.pc.ontrack = null;
    call.pc.close();
    if (notify) this.signal(call.remote, id, "stop");
    if (id === this.watching) this.watching = null;
  }

  destroy() {
    this.disposed = true;
    for (const id of this.calls.keys()) this.close(id, true);
    this.stopSharing();
    this.update({ remote: null, status: "Escolha uma tela para assistir." });
  }
}
