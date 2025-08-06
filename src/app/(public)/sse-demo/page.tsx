import dynamic from "next/dynamic";

const SSEDemoClient = dynamic(() => import("./SSEDemoClient"), { ssr: false });

export default function SSEDemoPage() {
  return (
    <main className="p-4 max-w-2xl mx-auto">
      <SSEDemoClient />
    </main>
  );
}
