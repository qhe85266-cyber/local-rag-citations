import { useEffect } from "react";
import type { ChatMessage } from "../types";
import { ANSWER_SCORE, MIN_COVERAGE, PARTIAL_COVERAGE } from "../lib/retrieve";
import { Highlight } from "./Highlight";

type Assistant = Extract<ChatMessage, { role: "assistant" }>;

type Props = {
  pending: 1 | 2 | 3 | null;
  message: Assistant | null;
  focusChunkId: string | null;
  onOpenChunk: (chunkId: string, n?: number) => void;
};

export function TracePanel({ pending, message, focusChunkId, onOpenChunk }: Props) {
  const result = message?.result ?? null;

  useEffect(() => {
    if (!focusChunkId) return;
    document.getElementById(`evidence-${focusChunkId}`)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [focusChunkId, message?.id]);

  const phase = pending ?? (result ? 4 : 0);
  const hits = result?.retrieved.filter((item) => item.score > 0) ?? [];
  const coverageBlocks = result
    ? result.coverage < MIN_COVERAGE ||
      (result.missingTerms.length > 0 && result.coverage < PARTIAL_COVERAGE)
    : false;

  return (
    <section className="panel" aria-label="依据">
      <header className="panel-h">
        <div>
          <h2>依据</h2>
          <p>分块、检索、阈值，都留在这里。</p>
        </div>
      </header>
      <div className="panel-scroll">
        <ol className="pipe">
          <li className={phase >= 1 ? "is-on" : undefined}>分块</li>
          <li className={phase >= 2 ? "is-on" : undefined}>检索</li>
          <li className={phase >= 3 ? "is-on" : undefined}>阈值</li>
          <li className={phase >= 4 ? "is-on" : undefined}>
            {result?.grounding === "none" ? "拒答" : "引用"}
          </li>
        </ol>

        {!result && (
          <div className="empty slim">
            <h3>还没有检索</h3>
            <p>选一个推荐问题后，这里会留下查询词、相关度和候选片段。拒答时也会保留没过阈值的片段。</p>
          </div>
        )}

        {result && (
          <>
            <p className={`verdict is-${result.grounding}`}>
              {result.grounding === "strong" && "这条回答只使用了引用里的原文，幻觉风险低。"}
              {result.grounding === "partial" && "文档只覆盖了问题的一部分。缺的内容没有被补写。"}
              {result.grounding === "none" && "没有越过作答阈值。拒答是规则，不是出错。"}
            </p>

            <dl className="metrics">
              <div>
                <dt>和阈值相比</dt>
                <dd>{result.topScore >= result.threshold ? "已超过" : "未达到"}</dd>
              </div>
              <div>
                <dt>相关度</dt>
                <dd>
                  {result.topScore.toFixed(1)}
                  <small> / {result.threshold.toFixed(2)}</small>
                </dd>
              </div>
              <div>
                <dt>覆盖率</dt>
                <dd>
                  {Math.round(result.coverage * 100)}%
                  <small>
                    {coverageBlocks ? " 不足" : result.missingTerms.length > 0 ? " 有缺" : " 完整"}
                  </small>
                </dd>
              </div>
            </dl>
            <p className="quiet">
              相关度要达到阈值，覆盖率至少 {Math.round(MIN_COVERAGE * 100)}%。问题里如果有文档没写的词，覆盖率要到{" "}
              {Math.round(PARTIAL_COVERAGE * 100)}% 才回答，并且不会把缺的部分补上。
              {result.composer === "curated" && " 这条命中了审校问法，并核对过原文锚点。"}
              {result.composer === "extractive" && " 没有命中预置问法，所以改为抽原句。"}
            </p>

            {result.terms.length > 0 && (
              <div className="term-row">
                <span>查询词</span>
                {result.terms.slice(0, 8).map((term) => (
                  <b key={term}>{term}</b>
                ))}
              </div>
            )}
            {result.expansions.length > 0 && (
              <p className="quiet">
                同义词只用于检索：
                {result.expansions.map((item) => `${item.from} → ${item.to}`).join("，")}
              </p>
            )}
            {result.missingTerms.length > 0 && (
              <p className="missing">文档没写到：{result.missingTerms.join("、")}</p>
            )}

            <p className="group-label">候选片段</p>
            {hits.length === 0 ? (
              <p className="quiet">没有词面重合的片段。</p>
            ) : (
              <div className="evidence-list">
                {hits.map((item) => {
                  const citation = result.citations.find((entry) => entry.chunkId === item.chunk.id);
                  const used = Boolean(citation);
                  const hot = focusChunkId === item.chunk.id;
                  return (
                    <article
                      key={item.chunk.id}
                      id={`evidence-${item.chunk.id}`}
                      className={`evidence ${used ? "is-used" : "is-muted"} ${hot ? "is-hot" : ""}`}
                    >
                      <header>
                        <strong>
                          {citation ? `引用 ${citation.n}` : "未引用"} · {item.chunk.heading}
                        </strong>
                        <em>{item.score.toFixed(2)}</em>
                      </header>
                      <div className="bar" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, (item.score / (ANSWER_SCORE * 2)) * 100)}%` }} />
                      </div>
                      <p>
                        <Highlight text={item.chunk.text} terms={result.terms} />
                      </p>
                      {citation && (
                        <button type="button" className="text-btn" onClick={() => onOpenChunk(item.chunk.id, citation.n)}>
                          定位这条引用
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
