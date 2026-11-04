import assert from "node:assert/strict";
import test from "node:test";
import {
  PHONON_VOICES,
  VOICE_GROUPS,
  previewPath,
  PHONON_CATALOGUE_REVISION,
  PHONON_MODEL_REVISION,
} from "../src/lib/voice-catalogue.mjs";

test("Phonon display labels retain the pinned catalogue's accent and gender metadata", () => {
  const expected = [
    ["Zoey", "en-us", "female"],
    ["Juniper", "en-us", "female"],
    ["Everly", "en-us", "female"],
    ["Harper", "en-us", "female"],
    ["Hadley", "en-us", "female"],
    ["Delia", "en-us", "female"],
    ["Easton", "en-us", "male"],
    ["Micah", "en-us", "male"],
    ["Trevor", "en-us", "male"],
    ["Russell", "en-us", "male"],
    ["Preston", "en-us", "male"],
    ["Miles", "en-us", "male"],
    ["Maeve", "en-gb", "female"],
    ["Freya", "en-gb", "female"],
    ["Pippa", "en-gb", "female"],
    ["Elodie-Rose", "en-gb", "female"],
    ["Imogen", "en-gb", "female"],
    ["Lottie", "en-gb", "female"],
    ["Alfie", "en-gb", "male"],
    ["Hugh", "en-gb", "male"],
    ["Edwin", "en-gb", "male"],
    ["Spencer", "en-gb", "male"],
    ["Toby", "en-gb", "male"],
    ["Teddy", "en-gb", "male"],
    ["Bryony", "en-gb", "female"],
  ];
  assert.deepEqual(
    PHONON_VOICES.filter((voice) => voice.group === "Regular English").map(
      ({ name, locale, gender }) => [name, locale, gender],
    ),
    expected,
  );
  assert.deepEqual(
    VOICE_GROUPS.phonon
      .flatMap((group) => group.voices)
      .map(([id, label]) => [id, label]),
    PHONON_VOICES.map((voice) => {
      const metadata = expected.find(([name]) => name === voice.name);
      return [
        voice.id,
        metadata
          ? `${voice.name} (${metadata[2] === "female" ? "Female" : "Male"})`
          : voice.name,
      ];
    }),
  );
  for (const voice of PHONON_VOICES.filter(
    (voice) => voice.group === "Characters",
  )) {
    assert.equal(voice.locale, "characters");
    assert.equal(voice.gender, null);
  }
});

test("pinned English catalogue has 25 regular and 12 character voices; Kokoro retains 28", () => {
  assert.equal(PHONON_VOICES.length, 37);
  assert.equal(new Set(PHONON_VOICES.map((v) => v.id)).size, 37);
  assert.deepEqual(
    VOICE_GROUPS.phonon.map((g) => [g.label, g.voices.length]),
    [
      ["American English", 12],
      ["British English", 13],
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
