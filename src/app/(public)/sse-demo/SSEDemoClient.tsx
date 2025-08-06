"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";

interface Message {
  event: string;
  data: unknown;
}

export default function SSEDemoClient() {
  const [lastMessage, setLastMessage] = useState<Message | null>(null);
  const clientIdRef = useRef<string>(crypto.randomUUID());
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const clientId = clientIdRef.current as string;

    const es = new EventSource(`/api/sse?clientId=${clientId}`);
    esRef.current = es;

    const handler = (ev: MessageEvent<string>) => {
      setLastMessage({ event: ev.type, data: JSON.parse(ev.data) });
    };

    // listen for all custom events via generic listener
    const genericListener = (ev: any) => handler(ev as MessageEvent<string>);
    es.addEventListener("connected", genericListener);
    es.addEventListener("test", genericListener);
    es.addEventListener("ping", () => {
      /* ignore */
    });

    es.onerror = (err) => {
      // eslint-disable-next-line no-console
      console.error("SSE error", err);
    };

    return () => {
      es.close();
    };
  }, []);

  const sendTestMessage = async () => {
    await fetch("/api/sse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName: "test",
        payload: { msg: `Hello at ${new Date().toLocaleTimeString()}` },
        broadcast: true,
      }),
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">SSE Demo</h2>
      <Button onClick={sendTestMessage}>Broadcast Test Message</Button>
      <div>
        <p className="font-mono text-sm text-gray-700 dark:text-gray-300">
          Last message:
        </p>
        <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded">
          {lastMessage ? JSON.stringify(lastMessage, null, 2) : "<none>"}
        </pre>
      </div>
    </div>
  );
}
