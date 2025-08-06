import dynamic from "next/dynamic";

// Import client component dynamically with ssr false to avoid Server global 'window' issues.
const SSEDemoClient = dynamic(() => import("./SSEDemoClient"), { ssr: false });

export default function SSEDemoPage() {
  return (
    <main className="p-4 max-w-2xl mx-auto">
      <SSEDemoClient />
    </main>
  );
}
