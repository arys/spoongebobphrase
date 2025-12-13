"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SearchResult = {
  episodeKey: string;
  cueIndex: number;
  startSec: number;
  endSec: number;
  time: string;
  text: string;
  youtubeUrl: string;
  embedUrl: string;
};

type ApiResponse =
  | {
      episodeKey: string;
      query: string;
    episodesSearched: string[];
      resultsCount: number;
      results: SearchResult[];
    }
  | { error: string; results: SearchResult[] };

export function SearchClient() {
  const [q, setQ] = useState("вы готовы дети");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const selected = useMemo(
    () => (results.length ? results[0] : null),
    [results]
  );

  async function runSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      abortRef.current?.abort();
      setLoading(false);
      setError(null);
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const res = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&episode=all`,
        {
        method: "GET",
        signal: ac.signal,
        }
      );
      const data = (await res.json()) as ApiResponse;

      if (!res.ok) {
        setError("error" in data ? data.error : "Ошибка поиска");
        setResults("results" in data ? data.results : []);
        return;
      }

      if ("results" in data) {
        const withAutoplay = data.results.map((r) => {
          const u = new URL(r.embedUrl);
          u.searchParams.set("autoplay", "1");
          return { ...r, embedUrl: u.toString() };
        });

        setResults(withAutoplay);
        if (data.results.length === 0) {
          setError("Ничего не найдено");
        }
      } else {
        setError("Ошибка ответа сервера");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Не удалось выполнить запрос");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh">
      {/* Full-screen player (reserved space at bottom for input bar) */}
      <div className="fixed inset-0 bottom-[calc(112px+env(safe-area-inset-bottom))] bg-black">
        {selected ? (
          <iframe
            key={selected.embedUrl}
            className="h-full w-full"
            src={selected.embedUrl}
            title="YouTube player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-white/70">
            Введите фразу снизу — здесь откроется видео на нужном таймкоде.
          </div>
        )}
      </div>

      {/* Clean "first match" overlay */}
      {/* {selected ? (
        <div className="fixed inset-x-0 bottom-[calc(112px+env(safe-area-inset-bottom))] bg-zinc-50/85 px-4 py-3 backdrop-blur dark:bg-black/70 sm:px-8">
          <div className="mx-auto flex w-full max-w-4xl items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-mono">{selected.time}</span>
                <span className="ml-2">· {selected.episodeKey}</span>
                <span className="ml-2">· найдено: {results.length}</span>
              </div>
              <div className="mt-1 truncate text-sm text-zinc-800 dark:text-zinc-200">
                {selected.text}
              </div>
            </div>
            <a
              className="shrink-0 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
              href={selected.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              YouTube
            </a>
          </div>
        </div>
      ) : null} */}

      <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-zinc-50/95 px-4 py-3 backdrop-blur dark:border-white/15 dark:bg-black/80 sm:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(q);
            }}
          >
            <div className="flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setError(null);
                }}
                placeholder="Например: важно потом раскачивается"
                className="h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-base outline-none ring-0 transition focus:border-black/30 dark:border-white/15 dark:bg-black"
              />
              <button
                type="submit"
                disabled={loading}
                className="h-12 shrink-0 rounded-xl bg-black px-4 text-base font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black"
              >
                Поиск
              </button>
            </div>
          </form>
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {loading ? "Ищу…" : "Готово"}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {error ? error : `Совпадений: ${results.length}`}
            </div>
          </div>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}


