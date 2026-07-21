// Split clean text into TTS-sized chunks: paragraph boundaries first, falling
// back to sentence, clause, then comma when one exceeds the budget. Never
// splits mid-word. Shared via `maxWords` by the Kokoro generator (~60) and the
// Gemini narration script (~200).

// A chunk under this many words can lose its last word to a TTS model's tail
// handling, so it gets folded into a neighbour.
export const SHORT_EDGE_WORDS = 20;

export function countWords(text) {
  const clean = String(text).replace(/\s+/gu, " ").trim();
  return clean === "" ? 0 : clean.split(" ").length;
}

export function chunkText(text, maxWords) {
  text = String(text).trim();
  if (text === "") return [];
  if (!Number.isFinite(maxWords) || maxWords < 10) maxWords = 10;

  const chunks = [];
  let current = "";
  let currentWords = 0;

  for (const rawPara of text.split(/\n\s*\n/u)) {
    const para = rawPara.trim();
    if (para === "") continue;
    const words = countWords(para);

    if (words > maxWords) {
      if (current !== "") {
        chunks.push(current);
        current = "";
        currentWords = 0;
      }
      for (const piece of splitParagraph(para, maxWords)) chunks.push(piece);
      continue;
    }

    if (currentWords > 0 && currentWords + words > maxWords) {
      chunks.push(current);
      current = "";
      currentWords = 0;
    }

    current = current === "" ? para : current + "\n\n" + para;
    currentWords += words;
  }

  if (current !== "") chunks.push(current);

  return absorbShortChunks(chunks, maxWords);
}

// Merges backwards, staying within 1.2× the cap; a still-short first chunk
// folds forward into the next instead.
function absorbShortChunks(chunks, maxWords) {
  if (chunks.length < 2) return chunks;
  const cap = Math.round(maxWords * 1.2);

  const result = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const cw = countWords(chunks[i]);
    if (cw < SHORT_EDGE_WORDS) {
      const last = result.length - 1;
      if (countWords(result[last]) + cw <= cap) {
        result[last] += "\n\n" + chunks[i];
        continue;
      }
    }
    result.push(chunks[i]);
  }

  if (result.length >= 2 && countWords(result[0]) < SHORT_EDGE_WORDS) {
    result[1] = result[0] + "\n\n" + result[1];
    result.shift();
  }

  return result;
}

function splitParagraph(para, maxWords) {
  let sentences = para.split(/(?<=[.!?])\s+(?=[A-Z\p{Lu}"'(])/u);
  if (sentences.length === 0) sentences = [para];

  const chunks = [];
  let current = "";
  let currentWords = 0;

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (sentence === "") continue;
    const words = countWords(sentence);

    if (currentWords > 0 && currentWords + words > maxWords) {
      chunks.push(current);
      current = "";
      currentWords = 0;
    }

    if (words <= maxWords) {
      current = current === "" ? sentence : current + " " + sentence;
      currentWords += words;
      continue;
    }

    if (current !== "") {
      chunks.push(current);
      current = "";
      currentWords = 0;
    }
    for (const piece of splitSentence(sentence, maxWords)) chunks.push(piece);
  }

  if (current !== "") chunks.push(current);
  return chunks;
}

function splitSentence(sentence, maxWords) {
  const parts = sentence.split(/(\s*(?:;|—|–|--)\s*)/u);
  if (parts.length < 3) return splitOnCommas(sentence, maxWords);

  const chunks = [];
  let current = "";
  let currentWords = 0;

  for (let i = 0; i < parts.length; i += 2) {
    const segment = (parts[i] ?? "").trim();
    const delim = (parts[i + 1] ?? "").trim();
    if (segment === "") continue;
    const piece = delim === "" ? segment : segment + " " + delim;
    const words = countWords(piece);

    if (currentWords > 0 && currentWords + words > maxWords) {
      chunks.push(current);
      current = "";
      currentWords = 0;
    }

    if (words <= maxWords) {
      current = current === "" ? piece : current + " " + piece;
      currentWords += words;
      continue;
    }

    if (current !== "") {
      chunks.push(current);
      current = "";
      currentWords = 0;
    }
    for (const sub of splitOnCommas(piece, maxWords)) chunks.push(sub);
  }

  if (current !== "") chunks.push(current);
  return chunks;
}

function splitOnCommas(segment, maxWords) {
  const parts = segment.split(/(\s*,\s*)/u);
  const hasCommas = parts.length > 1;

  const chunks = [];
  let current = "";
  let currentWords = 0;

  const pack = (piece) => {
    const words = countWords(piece);
    if (currentWords > 0 && currentWords + words > maxWords) {
      chunks.push(current);
      current = "";
      currentWords = 0;
    }
    if (words <= maxWords) {
      current = current === "" ? piece : current + " " + piece;
      currentWords += words;
      return;
    }
    if (current !== "") {
      chunks.push(current);
      current = "";
      currentWords = 0;
    }
    let buf = [];
    for (const w of piece.split(/\s+/u).filter(Boolean)) {
      buf.push(w);
      if (buf.length >= maxWords) {
        chunks.push(buf.join(" "));
        buf = [];
      }
    }
    if (buf.length) {
      current = buf.join(" ");
      currentWords = buf.length;
    }
  };

  if (!hasCommas) {
    pack(segment);
  } else {
    for (let i = 0; i < parts.length; i += 2) {
      const seg = (parts[i] ?? "").trim();
      const delim = (parts[i + 1] ?? "").trim();
      if (seg === "") continue;
      pack(delim === "" ? seg : seg + delim);
    }
  }

  if (current !== "") chunks.push(current);
  return chunks;
}
