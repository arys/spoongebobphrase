import fs from "node:fs";
import path from "node:path";

export type SubtitleCue = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type EpisodeConfig = {
  youtube_url: string;
  srt: string;
};

type IndexJson = Record<string, EpisodeConfig>;

const cueCache = new Map<string, SubtitleCue[]>();
const configCache: { value: IndexJson | null } = { value: null };

function dataDir(): string {
  return path.join(process.cwd(), "app", "data");
}

function readIndexJson(): IndexJson {
  if (configCache.value) return configCache.value;
  const indexPath = path.join(dataDir(), "index.json");
  const raw = fs.readFileSync(indexPath, "utf8");
  const parsed = JSON.parse(raw) as IndexJson;
  configCache.value = parsed;
  return parsed;
}

export function getAllEpisodeConfigs(): IndexJson {
  return readIndexJson();
}

export function listEpisodeKeys(): string[] {
  return Object.keys(readIndexJson()).sort();
}

export function getEpisodeConfig(episodeKey: string): EpisodeConfig | null {
  const index = readIndexJson();
  return index[episodeKey] ?? null;
}

export function extractYouTubeId(youtubeUrl: string): string | null {
  try {
    const u = new URL(youtubeUrl);
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v");
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace(/^\/+/, "");
      return id || null;
    }
    return null;
  } catch {
    return null;
  }
}

function parseSrtTimestampToMs(ts: string): number | null {
  // "HH:MM:SS,mmm"
  const m = ts.trim().match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const ms = Number(m[4]);
  if ([hh, mm, ss, ms].some((n) => Number.isNaN(n))) return null;
  return (((hh * 60 + mm) * 60 + ss) * 1000 + ms) | 0;
}

export function formatSeconds(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

function parseSrtContent(content: string): SubtitleCue[] {
  const lines = content.split(/\r?\n/);

  const cues: SubtitleCue[] = [];
  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i >= lines.length) break;

    const indexLine = lines[i].trim();
    const index = Number(indexLine);
    i++;
    if (!Number.isFinite(index) || i >= lines.length) continue;

    const timeLine = lines[i].trim();
    i++;
    const tm = timeLine.match(
      /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!tm) continue;
    const startMs = parseSrtTimestampToMs(tm[1]);
    const endMs = parseSrtTimestampToMs(tm[2]);
    if (startMs == null || endMs == null) continue;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i]);
      i++;
    }

    const text = textLines.join(" ").replace(/\s+/g, " ").trim();
    cues.push({ index, startMs, endMs, text });
  }

  return cues;
}

function loadCuesFromFile(cacheKey: string, srtPath: string): SubtitleCue[] {
  const cached = cueCache.get(cacheKey);
  if (cached) return cached;

  let content: string;
  try {
    content = fs.readFileSync(srtPath, "utf8");
  } catch {
    cueCache.set(cacheKey, []);
    return [];
  }

  const cues = parseSrtContent(content);
  cueCache.set(cacheKey, cues);
  return cues;
}

export function loadCues(episodeKey: string): SubtitleCue[] {
  const cfg = getEpisodeConfig(episodeKey);
  if (!cfg) {
    cueCache.set(episodeKey, []);
    return [];
  }

  const srtPath = path.join(dataDir(), cfg.srt.replace(/^\.\//, ""));
  return loadCuesFromFile(episodeKey, srtPath);
}

export function loadAiCues(episodeKey: string): SubtitleCue[] {
  const srtPath = path.join(dataDir(), "srt_ai", `${episodeKey}.srt`);
  return loadCuesFromFile(`ai:${episodeKey}`, srtPath);
}

export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


