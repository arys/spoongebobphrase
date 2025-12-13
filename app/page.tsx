import { SearchClient } from "@/app/components/SearchClient";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 text-black dark:bg-black dark:text-zinc-50">
      <SearchClient />
    </div>
  );
}
