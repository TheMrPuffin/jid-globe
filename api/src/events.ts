// Server-Sent Events: keeps a list of connected browsers and pushes updates to them.
import type { ServerResponse } from 'node:http';

const HEARTBEAT_MS = 25_000;

export interface EventHub {
  add(res: ServerResponse): void;
  broadcast(event: string, data: unknown): void;
  close(): void;
}

export function createEventHub(): EventHub {
  const clients = new Set<ServerResponse>();

  // A comment line every 25 s stops routers and browsers closing a quiet connection.
  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': heartbeat\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    add(res) {
      clients.add(res);
      res.on('close', () => clients.delete(res));
    },
    broadcast(event, data) {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of clients) res.write(message);
    },
    close() {
      clearInterval(heartbeat);
      for (const res of clients) res.end();
      clients.clear();
    },
  };
}
