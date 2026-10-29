import test from "node:test";
import assert from "node:assert/strict";
import {
  PREVIEW_TEXT,
  previewEntries,
  previewManifest,
  validateFileMapping,
} from "../scripts/lib/phonon-previews.mjs";
import { previewPath } from "../src/lib/voice-catalogue.mjs";
import { validatePreviewSettings } from "../scripts/generate-phonon-previews.mjs";
import {
  createVoiceSession,
  phononDurationDelta,
} from "../src/lib/voice-generator.mjs";

test("preview preflight accepts the session's normal speed and rejects other settings", () => {
  const session = createVoiceSession();
  const settings = { model: session.model, speed: session.settings.speed };
  validatePreviewSettings(settings);
  assert.equal(phononDurationDelta(settings.speed), 0);
  assert.equal(previewManifest({}, []).generation.duration_delta, 0);
  assert.throws(
    () => validatePreviewSettings({ ...settings, speed: 0 }),
    /normal speed/,
  );
  assert.throws(
    () => validatePreviewSettings({ ...settings, speed: 1.3 }),
    /normal speed/,
  );
  assert.throws(
    () => validatePreviewSettings({ ...settings, model: "kokoro" }),
    /Phonon/,
  );
});

test("preview manifest preserves all English IDs, groups, paths and pinned normal-speed inputs", () => {
  const files = previewEntries();
  const manifest = previewManifest({ node: process.version }, files);
  assert.equal(files.length, 37);
  assert.equal(files.filter((v) => v.group === "Regular English").length, 25);
  assert.equal(files.filter((v) => v.group === "Characters").length, 12);
  assert.equal(
    PREVIEW_TEXT,
    "Some mornings, the coffee tastes better than usual — and I never quite know why.",
  );
  assert.equal(manifest.model, "gradium/phonon-31m-en");
  assert.equal(
    manifest.modelRevision,
    "92741c5b07d085ff840e26fea8ce43110b87852f",
  );
  assert.equal(
    manifest.catalogueRevision,
    "0ee17205f254b5abc43b266c8a0f215565c352f7",
  );
  assert.equal(manifest.generation.duration_delta, 0);
  assert.equal(manifest.encoding.bitrateKbps, 128);
  assert.equal(manifest.listening.status, "not_performed");
  for (const file of files) {
    assert.equal(file.publicPath, previewPath("phonon", file.id));
    assert.equal(file.filename, `${file.id}-sample.mp3`);
  }
  validateFileMapping(manifest, files.map((file) => file.filename).reverse());
});

test("mapping rejects missing, duplicate, extra and mismatched preview files", () => {
  const files = previewEntries();
  const manifest = previewManifest({}, files);
  const names = files.map((file) => file.filename);
  assert.throws(() => validateFileMapping(manifest, names.slice(1)));
  assert.throws(() =>
    validateFileMapping(manifest, [...names.slice(1), names[1]]),
  );
  assert.throws(() =>
    validateFileMapping(manifest, [...names, "foreign-sample.mp3"]),
  );
  for (const key of ["id", "name", "group", "filename", "publicPath"]) {
    const changed = structuredClone(manifest);
    changed.files[0][key] = "incorrect";
    assert.throws(() => validateFileMapping(changed, names));
  }
});
