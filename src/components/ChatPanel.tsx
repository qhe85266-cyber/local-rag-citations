import { useEffect, useRef } from "react";
import type { ChatMessage, Expectation, SourceDoc } from "../types";
import { charCount } from "../lib/tokenize";

type Focus = { messageId: string; n: number; chunkId: string } | null;

type Props = {
  doc: SourceDoc;
  chunkCount: number;
  messages: ChatMessage[];
  pending: 1 | 2 | 3 | null;
  draft: string;
  banner: string | null;
  composerError: string | null;
  focus: Focus;
  onDraft: (value: string) => void;
  onAsk: (question: string) => void;
  onCite: (messageId: string, n: number, chunkId: string) => void;
  onSelectMessage: (id: string) => void;
  onClear: () => void;
};

const STEPS = ["提取查询词", "检索片段", "核对阈值"];

function expectCopy(expect: Expectation, origin: SourceDoc["origin"]): string {
  if (expect === "partial") return "依据会偏弱";
  if (expect === "refuse") return origin === "fixture" ? "应拒答" : "试拒答";
  return "应引用";
}

export function ChatPanel({
  doc,
  chunkCount,
  messages,
  pending,
  draft,
  banner,
  composerError,
  focus,
  onDraft,
  onAsk,
  onCite,
  onSelectMessage,
  onClear,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const count = [...draft].length;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = "0px";
    box.style.height = `${Math.min(box.scrollHeight, 128)}px`;
  }, [draft]);

  return (
    <section className="panel chat-panel" aria-label="问答">
      <header className="panel-h chat-h">
        <div>
          <h2>问答</h2>
          <p>
            {doc.title} · {chunkCount} 段 · {charCount(doc.text)} 字
          </p>
        </div>
        <div className="chat-tools">
          <button
            type="button"
            className="clear-btn"
            disabled={pending !== null || messages.length === 0}
            onClick={onClear}
          >
            清空对话
          </button>
          <div className="engine" role="group" aria-label="回答引擎">
            <button type="button" className="engine-btn is-on" aria-pressed="true">
              摘录
            </button>
            <button type="button" className="engine-btn" disabled title="演示版故意不接大模型">
              大模型
            </button>
          </div>
        </div>
      </header>

      {banner && <p className="banner">{banner}</p>}

      <div className="chat-log" ref={logRef} aria-live="polite" aria-busy={pending !== null}>
        {messages.length === 0 && !pending && (
          <div className="empty">
            <div className="empty-mark" aria-hidden="true">
              据
            </div>
            <h3>向当前文档提问</h3>
            <p>
              答案只来自命中的原文。能核对的会标上引用；文档没写的会直接拒答，而不是用外部知识补一句。
            </p>
          </div>
        )}

        {messages.map((message) => {
          if (message.role === "user") {
            return (
              <article key={message.id} className="bubble user">
                <p>{message.text}</p>
              </article>
            );
          }

          const { result } = message;
          const hot = focus?.messageId === message.id ? focus.n : null;
          return (
            <article
              key={message.id}
              className={`bubble assistant is-${result.grounding} ${
                focus?.messageId === message.id ? "is-active" : ""
              }`}
              onClick={() => onSelectMessage(message.id)}
            >
              <div className="bubble-top">
                <span className={`ground is-${result.grounding}`}>
                  <i />
                  {result.grounding === "strong"
                    ? "充分依据"
                    : result.grounding === "partial"
                      ? "依据偏弱"
                      : "文档未覆盖"}
                  <em>
                    {result.grounding === "strong"
                      ? "幻觉风险低"
                      : result.grounding === "partial"
                        ? "未补全缺漏"
                        : "已拒绝回答"}
                  </em>
                </span>
                <span className="composer-tag">
                  {result.composer === "curated"
                    ? "预置摘录"
                    : result.composer === "extractive"
                      ? "原文抽句"
                      : "拒答"}
                </span>
              </div>
              <RichText
                text={result.text}
                onCite={(n) => {
                  const citation = result.citations.find((item) => item.n === n);
                  if (!citation) return;
                  onCite(message.id, n, citation.chunkId);
                }}
                hot={hot}
              />
              {result.citations.length > 0 && (
                <div className="sources">
                  <span>来源</span>
                  {result.citations.map((citation) => (
                    <button
                      key={citation.n}
                      type="button"
                      className={hot === citation.n ? "source is-on" : "source"}
                      onClick={(event) => {
                        event.stopPropagation();
                        onCite(message.id, citation.n, citation.chunkId);
                      }}
                    >
                      <b>{citation.n}</b>
                      {citation.heading}
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}

        {pending && (
          <div className="thinking">
            {STEPS.map((label, index) => (
              <span key={label} className={pending >= index + 1 ? "is-on" : undefined}>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="ask">
        <div className="chips" aria-label="推荐问题">
          {doc.suggested.map((item) => (
            <button
              key={item.question}
              type="button"
              className="chip"
              disabled={pending !== null}
              onClick={() => onAsk(item.question)}
            >
              {item.label}
              <em className={`tag is-${item.expect}`}>{expectCopy(item.expect, doc.origin)}</em>
            </button>
          ))}
        </div>
        <div className="composer">
          <textarea
            ref={boxRef}
            rows={1}
            value={draft}
            placeholder="针对当前文档提问。文档没写的，会拒答。"
            aria-label="输入问题"
            maxLength={240}
            disabled={pending !== null}
            onChange={(event) => onDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.key === "Process") return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onAsk(draft);
              }
            }}
          />
          <button type="button" className="send" disabled={pending !== null || draft.trim().length === 0} onClick={() => onAsk(draft)}>
            提问
          </button>
        </div>
        <div className="composer-meta">
          <span>Enter 发送 · Shift + Enter 换行</span>
          <span>{count > 140 ? `${count}/200` : "大模型未接入"}</span>
        </div>
        {composerError && (
          <p className="alert" role="alert">
            {composerError}
          </p>
        )}
      </div>
    </section>
  );
}

function RichText({
  text,
  hot,
  onCite,
}: {
  text: string;
  hot: number | null;
  onCite: (n: number) => void;
}) {
  const parts = text.split(/\[(\d+)\]/g);
  return (
    <p className="answer-copy">
      {parts.map((part, index) => {
        if (index % 2 === 0) return <span key={index}>{part}</span>;
        const n = Number(part);
        return (
          <button
            key={index}
            type="button"
            className={hot === n ? "cite is-on" : "cite"}
            onClick={(event) => {
              event.stopPropagation();
              onCite(n);
            }}
          >
            {n}
          </button>
        );
      })}
    </p>
  );
}
