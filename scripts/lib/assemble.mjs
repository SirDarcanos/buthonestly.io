// Assemble per-chunk PCM (24 kHz mono 16-bit) into one MP3: concatenate with
// short silences between chunks (natural seams), then pipe through ffmpeg → 96
// kbps. ffmpeg is required.

import { spawn } from "node:child_process";

import { SAMPLE_RATE } from "./gemini-tts.mjs";

const BYTES_PER_SAMPLE = 2; // 16-bit
const MP3_BITRATE = "96k";

// Concatenate PCM buffers with `silenceMs` of silence between each.
export function concatPcm(buffers, silenceMs = 200) {
  const silenceBytes =
    Math.round((SAMPLE_RATE * silenceMs) / 1000) * BYTES_PER_SAMPLE;
  const silence = Buffer.alloc(silenceBytes); // zeroed = silence
  const parts = [];
  buffers.forEach((buf, i) => {
    if (i > 0 && silenceBytes > 0) parts.push(silence);
    parts.push(buf);
  });
  return Buffer.concat(parts);
}

// Duration in seconds of a raw PCM buffer.
export function pcmDurationSeconds(pcm) {
  return pcm.length / BYTES_PER_SAMPLE / SAMPLE_RATE;
}

// Encode raw PCM → MP3 at `outPath` via ffmpeg (PCM piped over stdin).
export function pcmToMp3(pcm, outPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "s16le",
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      MP3_BITRATE,
      outPath,
    ]);

    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("error", reject); // e.g. ffmpeg not on PATH
    ff.on("close", (code) => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
    });

    ff.stdin.on("error", () => {}); // ignore EPIPE if ffmpeg dies early
    ff.stdin.write(pcm);
    ff.stdin.end();
  });
}
