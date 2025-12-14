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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const shareTimerRef = useRef<number | null>(null);

  const selected = useMemo(() => {
    if (!results.length) return null;
    const idx = Math.min(Math.max(0, selectedIndex), results.length - 1);
    return results[idx] ?? null;
  }, [results, selectedIndex]);

  function clearShareStatusSoon() {
    if (shareTimerRef.current != null) {
      window.clearTimeout(shareTimerRef.current);
      shareTimerRef.current = null;
    }
    shareTimerRef.current = window.setTimeout(() => {
      setShareStatus(null);
      shareTimerRef.current = null;
    }, 1500);
  }

  async function copyShareLink(params: {
    episodeKey: string;
    seconds: number;
    phrase: string;
  }) {
    const { episodeKey, seconds, phrase } = params;
    const u = new URL(window.location.href);
    u.pathname = "/";
    u.searchParams.set("episode", episodeKey);
    u.searchParams.set("seconds", String(Math.max(0, Math.floor(seconds))));
    u.searchParams.set("phrase", phrase.trim());
    const link = u.toString();

    try {
      await navigator.clipboard.writeText(link);
      setShareStatus("Ссылка скопирована");
      clearShareStatusSoon();
    } catch {
      // Fallback: show prompt so user can copy manually
      window.prompt("Скопируйте ссылку:", link);
    }
  }

  async function runSearch(
    query: string,
    opts?: { episode?: string; targetSeconds?: number }
  ) {
    const trimmed = query.trim();
    if (!trimmed) {
      abortRef.current?.abort();
      setLoading(false);
      setError(null);
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setSelectedIndex(0);

    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const episode = (opts?.episode ?? "all").trim() || "all";
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&episode=${encodeURIComponent(episode)}`,
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
        if (withAutoplay.length > 0 && opts?.targetSeconds != null) {
          const target = Math.max(0, Math.floor(opts.targetSeconds));
          let bestIdx = 0;
          let bestDist = Number.POSITIVE_INFINITY;
          for (let i = 0; i < withAutoplay.length; i++) {
            const dist = Math.abs(withAutoplay[i].startSec - target);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
              if (dist === 0) break;
            }
          }
          setSelectedIndex(bestIdx);
        } else {
          setSelectedIndex(0);
        }
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
    const sp = new URLSearchParams(window.location.search);
    const phrase = (sp.get("phrase") ?? "").trim();
    const episode = (sp.get("episode") ?? "").trim();
    const secondsRaw = (sp.get("seconds") ?? "").trim();
    const seconds = secondsRaw ? Number(secondsRaw) : null;

    if (phrase) setQ(phrase);

    // If deep link is present: search within the episode and select the exact second.
    if (phrase && episode && Number.isFinite(seconds)) {
      void runSearch(phrase, {
        episode,
        targetSeconds: seconds as number,
      });
      return;
    }

    // Default behavior: initial search across all episodes.
    void runSearch(phrase || q);
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

      {/* Selected match overlay (with Share) */}
      {selected ? (
        <div className="fixed inset-x-0 bottom-[calc(112px+env(safe-area-inset-bottom))] bg-zinc-50/85 px-4 py-3 backdrop-blur dark:bg-black/70 sm:px-8">
          <div className="mx-auto flex w-full max-w-4xl items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-mono">{selected.time}</span>
                <span className="ml-2">· {selected.episodeKey}</span>
                <span className="ml-2">· найдено: {results.length}</span>
                {shareStatus ? (
                  <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                    · {shareStatus}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 truncate text-sm text-zinc-800 dark:text-zinc-200">
                {selected.text}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-white/80 px-3 py-2 text-sm font-medium text-black ring-1 ring-black/10 backdrop-blur transition hover:bg-white dark:bg-white/10 dark:text-white dark:ring-white/15 dark:hover:bg-white/15"
                onClick={() => {
                  void copyShareLink({
                    episodeKey: selected.episodeKey,
                    seconds: selected.startSec,
                    phrase: q,
                  });
                }}
              >
                Поделиться
              </button>
              <a
                className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                href={selected.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                YouTube
              </a>
            </div>
          </div>
        </div>
      ) : null}

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


