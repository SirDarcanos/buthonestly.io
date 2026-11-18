# Phonon preview handoff

## Generate locally

Use Node 24 and pnpm 11.20.0. Chrome, `ffmpeg` and `ffprobe` must already be installed. Start the project's dev server with `pnpm exec astro dev --background`. Confirm its port: another tracked or stale instance may already occupy 4321.

```sh
VOICE_PREVIEW_ORIGIN=http://localhost:4321 pnpm exec node scripts/generate-phonon-previews.mjs local/phonon-previews-97-complete
```

Keep repository writes and dev-server restarts paused during generation: hot reload can invalidate the browser job. The output directory must be explicit, its parent must exist, and the directory itself must not exist. The utility refuses to overwrite a previous run. `local/` is gitignored; never stage the generated MP3 files. A failed run retains completed files and `manifest.partial.json` for diagnosis; it is not an upload-ready set. Retry into a new directory rather than combining runs.

The utility drives the local Resource in headless Chrome, sequentially generating each of the source catalogue's 37 English voices. It uses the existing pinned Phonon 31M English q8 runtime and model/catalogue revisions, `duration_delta: 0`, one CPU thread, and the exact approved sentence:

> Some mornings, the coffee tastes better than usual — and I never quite know why.

GPU is disabled for consistent CPU generation. The actual worker backend is recorded and checked for every voice. MP3 encoding uses the Resource's `lamejs@1.2.1` encoder, mono at 128 kbps and the model's 24,000 Hz sample rate. The utility does not alter the Resource or catalogue and contains no upload operation or provider credentials.

## Validate and listen

```sh
pnpm exec node scripts/generate-phonon-previews.mjs --validate local/phonon-previews-97-complete
```

A successful generation leaves `manifest.json` and `validation.json` alongside the 37 MP3s. The manifest records ID, display name, group, filename, relative public path, pinned inputs, generation/encoding settings, environment, actual backend, file size, SHA-256 and probed audio facts. Validation checks the one-to-one file/catalogue mapping, pinned settings, checksums, nonempty files, mono MP3/128 kbps/24 kHz facts, positive duration, and full decoding with ffmpeg. Validation can be rerun after copying the directory. It does not establish whether the voice spoke the correct words.

**Listening is still required.** This headless workflow has no perceptual listening capability. Its manifest explicitly says `not_performed`. Before upload, the maintainer must listen to all 37 files for the complete sentence, correct content, obvious truncation and unusable output. Character voices may sound deliberately unusual; report actual defects rather than adjusting their speed individually. Do not interpret a decoder pass as an auditory review or automatic acceptance of #97.

## Manual R2 destination

Upload only the 37 `*-sample.mp3` files to the static asset bucket, under:

```text
phonon-voice-samples/<stable-voice-id>-sample.mp3
```

For example, Zoey is `phonon-voice-samples/NbpkqMVS3CJeq2j8-sample.mp3`. Each manifest `publicPath` is relative to the Resource's `STATIC_BASE`; use that configured base, not the site's essay origin. Preserve capitalization and IDs. Set the uploaded files' content type to `audio/mpeg`. Keep the manifest and validation report as the local handoff record; they need not be publicly uploaded. Do not upload anything under Kokoro's existing prefix.

The maintainer owns upload. Afterwards #98/#99 must check all public URLs and ID mappings. Missing previews must remain independent of local synthesis. This utility neither uploads assets nor verifies public availability.
