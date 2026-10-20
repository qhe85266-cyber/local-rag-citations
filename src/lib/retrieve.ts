import type { Chunk, ScoredChunk } from "../types";
import { tokenize } from "./tokenize";

const K1 = 1.2;
const B = 0.75;

function termFreq(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) freq.set(token, (freq.get(token) ?? 0) + 1);
  return freq;
}

export function rankChunks(chunks: Chunk[], queryTokens: string[]): ScoredChunk[] {
  if (chunks.length === 0) return [];

  const docs = chunks.map((chunk) =>
    tokenize(`${chunk.heading}\n${chunk.heading}\n${chunk.text}`),
  );
  const avgdl =
    docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const token of new Set(doc)) df.set(token, (df.get(token) ?? 0) + 1);
  }

  const nDocs = docs.length;
  const query = [...new Set(queryTokens)];

  const scored = chunks.map((chunk, index) => {
    const freq = termFreq(docs[index] ?? []);
    const dl = (docs[index] ?? []).length || 1;
    let score = 0;
    const matched = new Set<string>();

    for (const token of query) {
      const f = freq.get(token) ?? 0;
      if (!f) continue;
      matched.add(token);
      const n = df.get(token) ?? 0;
      const idf = Math.log(1 + (nDocs - n + 0.5) / (n + 0.5));
      const denom = f + K1 * (1 - B + (B * dl) / avgdl);
      score += idf * ((f * (K1 + 1)) / denom);
    }

    return {
      chunk,
      score,
      matchedTerms: [...matched],
    };
  });

  scored.sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);
  return scored;
}

export const ANSWER_SCORE = 1.15;
export const STRONG_SCORE = 2.05;
export const MIN_COVERAGE = 0.34;
export const PARTIAL_COVERAGE = 0.55;
