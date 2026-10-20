import type {
  AnswerResult,
  Citation,
  Chunk,
  Grounding,
  Script,
  ScoredChunk,
  SourceDoc,
} from "../types";
import { sentencesOf } from "./chunk";
import { ANSWER_SCORE, MIN_COVERAGE, PARTIAL_COVERAGE, STRONG_SCORE, rankChunks } from "./retrieve";
import { analyzeQuery, coverQuestion, tokenize } from "./tokenize";

function findChunk(chunks: Chunk[], anchor: string): Chunk | undefined {
  return chunks.find((chunk) => chunk.text.includes(anchor) || chunk.heading.includes(anchor));
}

function matchScripts(doc: SourceDoc, question: string): Script[] {
  const compact = question.replace(/\s+/g, "");
  const ranked = doc.scripts
    .map((script) => {
      if (script.avoid?.some((word) => compact.includes(word))) return null;
      let best = 0;
      for (const group of script.patterns) {
        if (group.every((key) => compact.includes(key))) {
          best = Math.max(best, group.join("").length);
        }
      }
      return best > 0 ? { script, best } : null;
    })
    .filter((item): item is { script: Script; best: number } => item !== null)
    .sort((a, b) => b.best - a.best);

  if (ranked.length === 0) return [];
  const top = ranked[0]?.best ?? 0;
  return ranked.filter((item) => item.best === top).map((item) => item.script);
}

function quoteFrom(chunk: Chunk, anchor?: string): string {
  if (anchor && chunk.text.includes(anchor)) {
    const sentences = sentencesOf(chunk.text);
    const hit = sentences.find((sentence) => sentence.includes(anchor));
    if (hit) return hit;
    return anchor;
  }
  const first = sentencesOf(chunk.text)[0];
  return first ?? chunk.text.slice(0, 80);
}

function citeChunks(
  picked: Array<{ chunk: Chunk; score: number; anchor?: string }>,
): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const item of picked) {
    if (seen.has(item.chunk.id)) continue;
    seen.add(item.chunk.id);
    citations.push({
      n: citations.length + 1,
      chunkId: item.chunk.id,
      index: item.chunk.index,
      heading: item.chunk.heading,
      score: item.score,
      quote: quoteFrom(item.chunk, item.anchor),
    });
  }
  return citations;
}

function termSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

function supportOf(ranked: ScoredChunk[]): ScoredChunk[] {
  const top = ranked[0]?.score ?? 0;
  if (top < ANSWER_SCORE) return [];
  return ranked
    .filter((item) => item.score >= ANSWER_SCORE && item.score >= top * 0.42)
    .slice(0, 3);
}

function decide(
  topScore: number,
  coverage: number,
  missing: string[],
): Grounding {
  if (topScore < ANSWER_SCORE || coverage < MIN_COVERAGE) return "none";
  if (missing.length > 0 && coverage < PARTIAL_COVERAGE) return "none";
  if (missing.length > 0 || coverage < 0.999 || topScore < STRONG_SCORE) return "partial";
  return "strong";
}

function sentenceScore(sentence: string, terms: string[]): number {
  const tokens = termSet(sentence);
  return terms.reduce((sum, term) => sum + (tokens.has(term) || sentence.includes(term) ? 1 : 0), 0);
}

function extractiveAnswer(
  support: ScoredChunk[],
  terms: string[],
): { text: string; citations: Citation[] } {
  const picked: Array<{ chunk: Chunk; score: number; sentence: string }> = [];

  for (const item of support) {
    const sentences = sentencesOf(item.chunk.text);
    let best = sentences[0] ?? item.chunk.text.trim();
    let bestScore = -1;
    for (const sentence of sentences) {
      const value = sentenceScore(sentence, terms);
      if (value > bestScore) {
        best = sentence;
        bestScore = value;
      }
    }
    if (!best || bestScore <= 0) continue;
    picked.push({ chunk: item.chunk, score: item.score, sentence: best });
    if (picked.length === 2) break;
  }

  const citations = citeChunks(picked.map((item) => ({ chunk: item.chunk, score: item.score, anchor: item.sentence })));
  const text = picked
    .map((item, index) => `${item.sentence}[${index + 1}]`)
    .join("\n\n");

  return { text, citations };
}

function refusalText(topScore: number, blockedByCoverage: boolean): string {
  if (topScore <= 0) {
    return "当前文档里没有和这个问题重合的表述。据引不会用文档以外的知识把答案补上。";
  }
  if (blockedByCoverage && topScore >= ANSWER_SCORE) {
    return "字面上有一些重合，但覆盖率不够，不能支撑一个可靠答案。据引不会把文档没写的部分补全。右侧保留了候选片段，方便对照。";
  }
  return "最接近的片段相关度不够，不能支撑一个可靠答案。据引不会把文档没写的部分补全。右侧保留了候选片段，方便你判断是文档没写，还是换个说法就能命中。";
}

export function answerQuestion(
  doc: SourceDoc,
  chunks: Chunk[],
  question: string,
): AnswerResult {
  const analysis = analyzeQuery(question);
  const base = {
    expansions: analysis.expansions,
    terms: analysis.terms,
    threshold: ANSWER_SCORE,
    retrieved: [] as ScoredChunk[],
    citations: [] as Citation[],
    coverage: 0,
    topScore: 0,
    missingTerms: [] as string[],
  };

  if (chunks.length === 0) {
    return {
      ...base,
      grounding: "none",
      composer: "refusal",
      text: "当前文档没有可检索的正文。换一份示例，或上传包含正文的 .txt / .md。",
    };
  }

  if (analysis.terms.length === 0) {
    return {
      ...base,
      grounding: "none",
      composer: "refusal",
      retrieved: rankChunks(chunks, analysis.tokens).slice(0, 4),
      text: "这句话里没有可以用来检索的关键词。换成文档里会出现的说法，例如制度、数字或限制。",
    };
  }

  const ranked = rankChunks(chunks, analysis.tokens);
  const topScore = ranked[0]?.score ?? 0;
  const support = supportOf(ranked);
  const supportText = support.map((item) => `${item.chunk.heading}\n${item.chunk.text}`).join("\n");
  const inDoc = coverQuestion(analysis.expandedText, doc.text);
  const inSupport = coverQuestion(analysis.expandedText, supportText);
  const coverage = inSupport.coverage;
  const grounding = decide(topScore, coverage, inDoc.missing);

  const shared = {
    ...base,
    terms: inDoc.found.length > 0 ? inDoc.found : inDoc.missing,
    retrieved: ranked.slice(0, 4),
    coverage,
    topScore,
    missingTerms: inDoc.missing,
  };

  if (grounding === "none") {
    const blockedByCoverage =
      coverage < MIN_COVERAGE ||
      (inDoc.missing.length > 0 && coverage < PARTIAL_COVERAGE);
    return {
      ...shared,
      grounding,
      composer: "refusal",
      text: refusalText(topScore, blockedByCoverage),
    };
  }

  const scripts = matchScripts(doc, question);
  const script = scripts.length === 1 ? scripts[0] : undefined;
  if (script && inDoc.missing.length === 0 && inSupport.coverage >= 0.999) {
    const anchored = script.anchors.map((anchor) => ({
      anchor,
      chunk: findChunk(chunks, anchor),
    }));
    if (anchored.every((item) => item.chunk)) {
      const picked = anchored.flatMap((item) => {
        const scored = ranked.find((row) => row.chunk.id === item.chunk?.id);
        return item.chunk
          ? [{ chunk: item.chunk, score: scored?.score ?? topScore, anchor: item.anchor }]
          : [];
      });
      const anchorText = picked.map((item) => `${item.chunk.heading}\n${item.chunk.text}`).join("\n");
      const anchorMiss = inSupport.found.filter((term) => !anchorText.includes(term));
      if (inSupport.found.length > 0 && anchorMiss.length === 0) {
        const citations = citeChunks(picked);
        return {
          ...shared,
          grounding: topScore >= STRONG_SCORE ? "strong" : "partial",
          composer: "curated",
          citations,
          missingTerms: [],
          text: script.text,
        };
      }
    }
  }

  const extracted = extractiveAnswer(support, inSupport.found);
  if (!extracted.text.trim() || extracted.citations.length === 0) {
    return {
      ...shared,
      grounding: "none",
      composer: "refusal",
      citations: [],
      missingTerms: [],
      text: refusalText(topScore, false),
    };
  }

  let text = extracted.text;
  if (inDoc.missing.length > 0) {
    const shown = inDoc.missing.slice(0, 4).join("、");
    text += `\n\n文档没有写到：${shown}。这些部分不会用外部知识补全。`;
  }

  return {
    ...shared,
    grounding,
    composer: "extractive",
    citations: extracted.citations,
    text,
  };
}
