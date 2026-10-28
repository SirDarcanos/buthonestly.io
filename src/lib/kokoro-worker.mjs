import {
  KOKORO_MODULE_URL,
  KOKORO_MODEL_ID,
  createPinnedModelFetch,
} from "./voice-generator.mjs";

let runtime;
self.fetch = createPinnedModelFetch(self.fetch.bind(self));
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      const { KokoroTTS } = await import(/* @vite-ignore */ KOKORO_MODULE_URL);
      runtime = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        ...data.options,
        progress_callback: (progress) => {
          if (progress.status === "progress" && progress.total)
            self.postMessage({
              status: `Downloading ${progress.file}: ${Math.round(progress.progress)}%…`,
            });
        },
      });
      self.postMessage({ id: data.id, result: true });
    } else if (data.type === "generate") {
      const result = await runtime.generate(data.text, data.options);
      self.postMessage(
        {
          id: data.id,
          result: { audio: result.audio, sampling_rate: result.sampling_rate },
        },
        [result.audio.buffer],
      );
    } else throw new Error("Unknown Kokoro request.");
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
