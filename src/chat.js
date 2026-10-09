export function mergeMessages(current, incoming) {
  const unique = new Map(current.map((message) => [message.seq, message]));
  for (const message of incoming) unique.set(message.seq, message);
  return [...unique.values()].sort((a, b) => a.seq - b.seq);
}

export function acknowledge(pending, messages, participantId) {
  const received = new Set(
    messages
      .filter((message) => message.participantId === participantId)
      .map((message) => message.clientId),
  );
  return pending.filter((message) => !received.has(message.clientId));
}

export async function request(path, options = {}) {
  const origin = import.meta.env.VITE_API_ORIGIN;
  const response = await fetch(origin ? `${origin}${path}` : path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.message ||
        `Não foi possível concluir a operação (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
