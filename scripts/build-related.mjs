import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { loadEssayInventory } from "../src/lib/essay-inventory.mjs";
import {
  buildSemanticState,
  writeGeneratedFile,
} from "../src/lib/related-essays.mjs";

const EMBEDDINGS_FILE = "data/embeddings.json";
const RELATED_FILE = "data/related.json";
const MODEL = "Xenova/bge-small-en-v1.5";
const MODEL_REVISION = "ea104dacec62c0de699686887e3f920caeb4f3e3";
const EMBEDDING_VERSION = `${MODEL}@${MODEL_REVISION}:mean-normalized:input-v1`;
const round = (value) => Math.round(value * 1e6) / 1e6;

async function embed(texts) {
  let pipeline;
  try {
    ({ pipeline } = await import("@huggingface/transformers"));
  } catch (error) {
    throw new Error(
      "Changed essays require @huggingface/transformers: npm install --no-save @huggingface/transformers@4.2.0",
      { cause: error },
    );
  }

  console.log(`Embedding ${texts.length} new/changed essay(s)…`);
  const extractor = await pipeline("feature-extraction", MODEL, {
    revision: MODEL_REVISION,
  });
  const vectors = [];
  for (const text of texts) {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    vectors.push(Array.from(output.data, round));
  }
  return vectors;
}

async function main() {
  const inventory = loadEssayInventory();
  const cache = existsSync(EMBEDDINGS_FILE)
    ? JSON.parse(await readFile(EMBEDDINGS_FILE, "utf8"))
    : {};
  const state = await buildSemanticState({
    inventory,
    cache,
    embed,
    embeddingVersion: EMBEDDING_VERSION,
  });

  await mkdir("data", { recursive: true });
  const embeddingsChanged = await writeGeneratedFile(
    EMBEDDINGS_FILE,
    `${JSON.stringify(state.cache)}\n`,
  );
  const rankingsChanged = await writeGeneratedFile(
    RELATED_FILE,
    `${JSON.stringify(state.related, null, 2)}\n`,
  );
  const embeddedCount = Object.values(state.cache).filter(
    ({ vector }) => vector,
  ).length;

  console.log(
    embeddingsChanged || rankingsChanged
      ? `Updated semantic state (${inventory.essays.length} essays, ${embeddedCount} with vectors).`
      : "Semantic state unchanged.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
