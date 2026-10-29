import assert from "node:assert/strict";
import test from "node:test";
import {
  PHONON_VOICES,
  VOICE_GROUPS,
  previewPath,
  PHONON_CATALOGUE_REVISION,
  PHONON_MODEL_REVISION,
} from "../src/lib/voice-catalogue.mjs";

test("pinned English catalogue has 25 regular and 12 character voices; Kokoro retains 28", () => {
  assert.equal(PHONON_VOICES.length, 37);
  assert.equal(new Set(PHONON_VOICES.map((v) => v.id)).size, 37);
  assert.deepEqual(
    VOICE_GROUPS.phonon.map((g) => [g.label, g.voices.length]),
    [
      ["English", 25],
      ["Characters", 12],
    ],
  );
  assert.deepEqual(
    VOICE_GROUPS.kokoro.map((g) => g.voices.length),
    [20, 8],
  );
  for (const revision of [PHONON_CATALOGUE_REVISION, PHONON_MODEL_REVISION])
    assert.match(revision, /^[a-f0-9]{40}$/);
  assert.equal(
    PHONON_VOICES.find((v) => v.name === "Zoey").id,
    "NbpkqMVS3CJeq2j8",
  );
  for (const v of PHONON_VOICES) {
    assert.equal(v.filename, `voices/${v.id}.safetensors`);
    assert.equal(
      previewPath("phonon", v.id),
      `phonon-voice-samples/${v.id}-sample.mp3`,
    );
  }
  assert.equal(
    previewPath("kokoro", "af_heart"),
    "kokoro-voice-samples/af_heart-sample.mp3",
  );
});
