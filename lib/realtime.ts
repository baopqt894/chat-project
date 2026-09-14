import { io, type Socket } from "socket.io-client";
import { readApiResponse } from "./http";
export type RealtimeConnection = Pick<Socket, "on" | "emit" | "disconnect">;
// Vercel uses short, authenticated HTTP requests, with events/presence shared in MongoDB.
// Node deployments retain Socket.IO. Neither transport holds durable state in the browser.
export function connectRealtime(
  transport: "socket" | "polling" = "socket",
): RealtimeConnection {
  if (transport === "socket") return io();
  type Handler = (payload?: unknown) => unknown;
  const listeners = new Map<string, Handler[]>();
  const clientId = crypto.randomUUID();
  let stopped = false,
    connected = false,
    revision = -1,
    since: number | undefined,
    timer: ReturnType<typeof setTimeout>,
    lastTyping = 0;
  let outbound = Promise.resolve();
  const seen = new Set<string>();
  const dispatch = async (event: string, payload?: unknown) => {
    for (const handler of listeners.get(event) || []) await handler(payload);
  };
  async function request(body: unknown) {
    return readApiResponse(
      await fetch("/api/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      }),
    );
  }
  async function poll() {
    const started = Date.now();
    let delay = document.hidden ? 3000 : 750;
    try {
      const data = await request({ clientId, since });
      if (stopped) return;
      since = data.cursor;
      if (!connected) {
        connected = true;
        await dispatch("connect");
      }
      if (data.revision !== revision) {
        revision = data.revision;
        await dispatch("refresh");
      }
      await dispatch("presence", data.online);
      for (const event of data.events) {
        if (stopped) return;
        if (!seen.has(event.id)) {
          seen.add(event.id);
          await dispatch(event.type, event.payload);
        }
      }
      if (seen.size > 1000) {
        for (const id of [...seen].slice(0, 500)) seen.delete(id);
      }
    } catch (e) {
      if (!stopped) {
        connected = false;
        await dispatch("presence", []);
        await dispatch("connect_error", e);
      }
      delay = 3000;
    }
    if (!stopped) timer = setTimeout(poll, Math.max(100, delay - (Date.now() - started)));
  }
  const adapter = {
    on(event: string, handler: Handler) {
      listeners.set(event, [...(listeners.get(event) || []), handler]);
      return adapter;
    },
    emit(event: string, payload: unknown) {
      if (stopped) return adapter;
      if (event === "typing") {
        if (Date.now() - lastTyping < 1000) return adapter;
        lastTyping = Date.now();
      }
      outbound = outbound
        .then(async () => {
          if (!stopped) await request({ event, payload });
        })
        .catch((e) => {
          void dispatch("connect_error", e);
        });
      return adapter;
    },
    disconnect() {
      stopped = true;
      clearTimeout(timer);
      listeners.clear();
      return adapter;
    },
  };
  timer = setTimeout(poll, 0);
  return adapter as unknown as RealtimeConnection;
}
