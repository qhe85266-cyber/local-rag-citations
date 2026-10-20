export type Grounding = "strong" | "partial" | "none";

export type Expectation = "answer" | "partial" | "refuse";

export type SuggestedQuestion = {
  label: string;
  question: string;
  expect: Expectation;
};

export type Script = {
  patterns: string[][];
  avoid?: string[];
  anchors: string[];
  text: string;
};

export type SourceDoc = {
  id: string;
  title: string;
  kicker: string;
  summary: string;
  text: string;
  origin: "fixture" | "upload";
  filename?: string;
  suggested: SuggestedQuestion[];
  scripts: Script[];
};

export type Chunk = {
  id: string;
  index: number;
  heading: string;
  text: string;
};

export type ScoredChunk = {
  chunk: Chunk;
  score: number;
  matchedTerms: string[];
};

export type Citation = {
  n: number;
  chunkId: string;
  index: number;
  heading: string;
  score: number;
  quote: string;
};

export type Expansion = {
  from: string;
  to: string;
};

export type AnswerResult = {
  grounding: Grounding;
  text: string;
  citations: Citation[];
  retrieved: ScoredChunk[];
  terms: string[];
  expansions: Expansion[];
  composer: "curated" | "extractive" | "refusal";
  coverage: number;
  topScore: number;
  threshold: number;
  missingTerms: string[];
};

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; question: string; result: AnswerResult };
