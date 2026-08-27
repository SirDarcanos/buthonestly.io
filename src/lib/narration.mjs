import path from "node:path";
import { STATIC_BASE } from "./cdn.mjs";

export const narrationUrl = (filename, staticBase = STATIC_BASE) =>
  `${staticBase.replace(/\/$/, "")}/audio/${encodeURIComponent(path.basename(filename))}`;
