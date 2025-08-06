import { type NextRequest } from "next/server";

import { SSEManager } from "@/lib/sse";

// Opt-in to the Node.js runtime to ensure we have access to the Web Streams API.
export const runtime = "nodejs";

/**
 * SSE endpoint: /api/sse
 *
 * A client can connect by creating a native `EventSource('/api/sse?clientId=123')`.
 * If `clientId` is omitted a random one will be generated and sent back in the
 * first `connected` event payload.
 */
export function GET(req: NextRequest): Response {
  // Derive / generate a client identifier. In a real-world application you'd
  // probably take this from the session/user. For now we allow the client to
  // supply one via query param.
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") ?? crypto.randomUUID();

  // Create a web stream pair (readable/writable)
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Register client so other backend modules can push messages.
  SSEManager.addClient(clientId, writer);

  // Immediately inform the client that the connection is established.
  void SSEManager.send(clientId, "connected", { clientId });

  // Keep the connection alive – most proxies close idle connections after ~30s.
  const heartbeat = setInterval(() => {
    void SSEManager.ping(clientId);
  }, 25_000);

  // Clean-up when the client closes the connection (browser tab closed, network gone …)
  const close = () => {
    clearInterval(heartbeat);
    SSEManager.removeClient(clientId, writer);
    try {
      writer.close();
    } catch {
      /* ignored */
    }
  };

  // AbortSignal is triggered once the connection closes.
  req.signal.addEventListener("abort", close);

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // We purposely do NOT enable CORS here because the app's origin will match.
      // Uncomment the next line if you expect cross-origin connections.
      // "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * POST /api/sse
 *
 * Send events to connected clients. Expected JSON body:
 * {
 *   "eventName": string,
 *   "payload"?: any,
 *   "broadcast"?: boolean,
 *   "clientIds"?: string[]
 * }
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();

    const { eventName, payload = {}, broadcast = false, clientIds } = body ?? {};

    if (typeof eventName !== "string" || eventName.length === 0) {
      return new Response(JSON.stringify({ error: "eventName is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (broadcast) {
      await SSEManager.broadcast(eventName, payload);
    } else if (Array.isArray(clientIds) && clientIds.length > 0) {
      await SSEManager.multicast(clientIds, eventName, payload);
    } else {
      return new Response(
        JSON.stringify({ error: "Provide clientIds or set broadcast=true" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error("[SSE] POST error", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
