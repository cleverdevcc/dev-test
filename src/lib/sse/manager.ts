/*
  Centralized Server-Sent Events (SSE) manager
  -------------------------------------------
  Keeps track of connected clients and exposes helper functions
  to push named events with JSON payloads to one or many clients.
*/

// NOTE: We purposely keep the type loose here because `WritableStreamDefaultWriter` is
//       overloaded differently in Node.js & Edge runtimes. We only rely on the `.write` & `.close` APIs.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
export type ClientWriter = WritableStreamDefaultWriter<any>;

// Re-use the same client registry across hot-reloads in development to prevent leaks.
const globalWithSSE = globalThis as typeof globalThis & {
  __SSE_CLIENTS__?: Map<string, Set<ClientWriter>>;
};

if (!globalWithSSE.__SSE_CLIENTS__) {
  globalWithSSE.__SSE_CLIENTS__ = new Map();
}

const clientRegistry = globalWithSSE.__SSE_CLIENTS__!;

const textEncoder = new TextEncoder();

function formatEvent(eventName: string, payload: unknown): Uint8Array {
  // SSE format: each event is separated by a blank line
  // We stringify payload once to avoid implicit conversions.
  const data = JSON.stringify(payload ?? {});
  return textEncoder.encode(`event: ${eventName}\ndata: ${data}\n\n`);
}

export class SSEManager {
  /**
   * Add a client writer to the registry.
   */
  static addClient(clientId: string, writer: ClientWriter): void {
    if (!clientRegistry.has(clientId)) {
      clientRegistry.set(clientId, new Set());
    }

    clientRegistry.get(clientId)!.add(writer);
  }

  /**
   * Remove a client writer from the registry.
   */
  static removeClient(clientId: string, writer: ClientWriter): void {
    const writers = clientRegistry.get(clientId);
    if (!writers) return;

    writers.delete(writer);

    // Clean up empty sets to free memory.
    if (writers.size === 0) {
      clientRegistry.delete(clientId);
    }
  }

  /**
   * Send a named event with JSON payload to every writer associated with a client.
   */
  static async send(clientId: string, eventName: string, payload: unknown): Promise<void> {
    const writers = clientRegistry.get(clientId);
    if (!writers) return;

    const chunk = formatEvent(eventName, payload);

    await Promise.all(
      Array.from(writers).map(async (writer) => {
        try {
          await writer.write(chunk);
        } catch (err) {
          // On error, immediately remove the writer to prevent future failures.
          this.removeClient(clientId, writer);
          console.error("[SSE] Failed to write to client", clientId, err);
        }
      }),
    );
  }

  /**
   * Broadcast a named event to ALL connected clients.
   */
  static async broadcast(eventName: string, payload: unknown): Promise<void> {
    await Promise.all(
      Array.from(clientRegistry.keys()).map((id) => this.send(id, eventName, payload)),
    );
  }

  /**
   * Send a named event to a subset of clients.
   */
  static async multicast(clientIds: string[], eventName: string, payload: unknown): Promise<void> {
    await Promise.all(clientIds.map((id) => this.send(id, eventName, payload)));
  }

  /**
   * Convenience alias for heartbeat / ping events.
   */
  static async ping(clientId: string): Promise<void> {
    await this.send(clientId, "ping", { timestamp: Date.now() });
  }
}
