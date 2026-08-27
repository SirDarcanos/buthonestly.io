import path from "node:path";
import { STATIC_BASE } from "./cdn.mjs";

export const AUDIO_EMBED_SOURCE = String.raw`!\[\[([^\]|]+?\.(?:mp3|m4a|ogg|wav))(?:\|[^\]]*)?\]\]`;

export const narrationUrl = (filename, staticBase = STATIC_BASE) =>
  `${staticBase.replace(/\/$/, "")}/audio/${encodeURIComponent(path.basename(filename))}`;

export const narrationFiles = (source) => {
  const prose = source.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return [...prose.matchAll(new RegExp(AUDIO_EMBED_SOURCE, "gi"))].map(
    (match) => path.basename(match[1].trim()),
  );
};
