import { NextRequest, NextResponse } from "next/server";
import {
  extractYouTubeId,
  formatSeconds,
  getAllEpisodeConfigs,
  getEpisodeConfig,
  loadCues,
  normalizeForSearch,
} from "@/app/lib/subtitles";

export const runtime = "nodejs";

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

function buildResult(params: {
  episodeKey: string;
  cueIndex: number;
  startSec: number;
  endSec: number;
  text: string;
  videoId: string;
}): SearchResult {
  const { episodeKey, cueIndex, startSec, endSec, text, videoId } = params;
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}&t=${startSec}s`;
  // Use the no-cookie domain to reduce cases where the iframe hangs due to
  // 3rd-party cookie / consent restrictions in some browsers.
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?start=${startSec}`;
  return {
    episodeKey,
    cueIndex,
    startSec,
    endSec,
    time: formatSeconds(startSec),
    text,
    youtubeUrl,
    embedUrl,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") ?? "").trim();
  const episodeParam = (searchParams.get("episode") ?? "s1e1").trim();

  if (!qRaw) {
    return NextResponse.json(
      { error: "Пустой запрос", results: [] },
      { status: 400 }
    );
  }

  const q = normalizeForSearch(qRaw);
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Слишком короткий запрос", results: [] },
      { status: 400 }
    );
  }

  const results: SearchResult[] = [];

  const episodeKeys =
    episodeParam === "all" ? Object.keys(getAllEpisodeConfigs()) : [episodeParam];

  for (const episodeKey of episodeKeys) {
    const cfg = getEpisodeConfig(episodeKey);
    if (!cfg) continue;

    const videoId = extractYouTubeId(cfg.youtube_url);
    if (!videoId) continue;

    const cues = loadCues(episodeKey);
    for (const cue of cues) {
      if (!cue.text) continue;
      const hay = normalizeForSearch(cue.text);
      if (!hay.includes(q)) continue;

      const startSec = Math.max(0, Math.floor(cue.startMs / 1000));
      const endSec = Math.max(startSec, Math.floor(cue.endMs / 1000));
      results.push(
        buildResult({
          episodeKey,
          cueIndex: cue.index,
          startSec,
          endSec,
          text: cue.text,
          videoId,
        })
      );

      if (results.length >= 50) break;
    }

    if (results.length >= 50) break;
  }

  if (episodeParam !== "all" && results.length === 0) {
    const cfg = getEpisodeConfig(episodeParam);
    if (!cfg) {
      return NextResponse.json(
        { error: "Эпизод не найден", results: [] },
        { status: 404 }
      );
    }
  }

  return NextResponse.json({
    episodeKey: episodeParam,
    query: qRaw,
    episodesSearched: episodeKeys,
    resultsCount: results.length,
    results,
  });
}


