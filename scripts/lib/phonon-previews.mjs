import assert from "node:assert/strict";
import {
  PHONON_VOICES,
  PHONON_MODEL_REVISION,
  PHONON_CATALOGUE_REVISION,
  previewPath,
} from "../../src/lib/voice-catalogue.mjs";

export const PREVIEW_TEXT =
  "Some mornings, the coffee tastes better than usual — and I never quite know why.";

export function previewEntries() {
  assert.equal(PHONON_VOICES.length, 37);
  assert.equal(new Set(PHONON_VOICES.map((voice) => voice.id)).size, 37);
  assert.equal(
    PHONON_VOICES.filter((v) => v.group === "Regular English").length,
    25,
  );
  assert.equal(
    PHONON_VOICES.filter((v) => v.group === "Characters").length,
    12,
  );
  return PHONON_VOICES.map(({ id, name, group }) => ({
    id,
    name,
    group,
    filename: `${id}-sample.mp3`,
    publicPath: previewPath("phonon", id),
  }));
}

export function previewManifest(environment, files) {
  return {
    model: "gradium/phonon-31m-en",
    modelRevision: PHONON_MODEL_REVISION,
    catalogue: "gradium/phonon-voices",
    catalogueRevision: PHONON_CATALOGUE_REVISION,
    runtime: "phonon-tts@0.5.0",
    text: PREVIEW_TEXT,
    generation: {
      lang: "en",
      quant: "q8",
      duration_delta: 0,
      threads: 1,
      requestedDevice: "auto",
    },
    encoding: {
      encoder: "lamejs@1.2.1",
      codec: "mp3",
      bitrateKbps: 128,
      channels: 1,
      sourceSampleFormat: "float32 clipped to signed 16-bit",
    },
    environment,
    listening: {
      status: "not_performed",
      reason:
        "Decoder checks do not establish spoken content or perceptual quality. Maintainer listening is required before upload.",
    },
    files,
  };
}

export function validateFileMapping(manifest, filenames) {
  const entries = previewEntries();
  assert.equal(manifest.files.length, entries.length);
  assert.deepEqual(
    [...filenames].sort(),
    entries.map((entry) => entry.filename).sort(),
  );
  for (const [index, entry] of entries.entries()) {
    for (const [key, value] of Object.entries(entry))
      assert.equal(manifest.files[index][key], value);
  }
}
