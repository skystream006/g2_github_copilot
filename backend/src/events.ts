import type { Response } from "express";

export interface SessionEvent {
  type: string;
  sessionId: string;
  [key: string]: unknown;
}

/**
 * A tiny Server-Sent-Events pub/sub hub. Frontend clients subscribe to a
 * stream of events (assistant text chunks, tool calls, turn lifecycle) the
 * same way the original glasses HUD consumed events over SSE.
 */
export class EventHub {
  private clients = new Set<Response>();

  subscribe(res: Response): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(":ok\n\n");
    this.clients.add(res);

    res.on("close", () => {
      this.clients.delete(res);
    });
  }

  publish(event: SessionEvent): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
