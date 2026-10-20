import { useRef, useState } from "react";
import type { Chunk, SourceDoc } from "../types";
import { charCount } from "../lib/tokenize";

type Props = {
  docs: SourceDoc[];
  activeId: string;
  chunks: Chunk[];
  hotChunkId: string | null;
  uploadError: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onUpload: (file: File) => void;
};

export function DocPanel({
  docs,
  activeId,
  chunks,
  hotChunkId,
  uploadError,
  disabled,
  onSelect,
  onRemove,
  onUpload,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const fixtures = docs.filter((doc) => doc.origin === "fixture");
  const uploads = docs.filter((doc) => doc.origin === "upload");
  const active = docs.find((doc) => doc.id === activeId);

  function take(file: File | undefined) {
    if (!file || disabled) return;
    onUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="panel" aria-label="文档">
      <header className="panel-h">
        <div>
          <h2>文档</h2>
          <p>检索范围只有当前这一份。</p>
        </div>
      </header>
      <div className="panel-scroll">
        <p className="group-label">示例</p>
        <div className="doc-list">
          {fixtures.map((doc) => (
            <article key={doc.id} className={doc.id === activeId ? "doc-card is-on" : "doc-card"}>
              <button
                type="button"
                className="doc-main"
                aria-current={doc.id === activeId}
                disabled={disabled}
                onClick={() => onSelect(doc.id)}
              >
                <span className="kicker">{doc.kicker}</span>
                <strong>{doc.title}</strong>
                <span>{doc.summary}</span>
              </button>
            </article>
          ))}
        </div>

        {uploads.length > 0 && (
          <>
            <p className="group-label">本次上传</p>
            <div className="doc-list">
              {uploads.map((doc) => (
                <article key={doc.id} className={doc.id === activeId ? "doc-card is-on" : "doc-card"}>
                  <button
                    type="button"
                    className="doc-main"
                    aria-current={doc.id === activeId}
                    disabled={disabled}
                    onClick={() => onSelect(doc.id)}
                  >
                    <span className="kicker">{doc.kicker}</span>
                    <strong>{doc.title}</strong>
                    <span>{doc.filename}</span>
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    disabled={disabled}
                    onClick={() => onRemove(doc.id)}
                  >
                    移除
                  </button>
                </article>
              ))}
            </div>
          </>
        )}

        <p className="group-label">或上传</p>
        <div
          className={dragOver ? "drop is-over" : "drop"}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            take(event.dataTransfer.files?.[0]);
          }}
        >
          <input
            ref={inputRef}
            className="file-input"
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            aria-label="上传文本文档"
            onChange={(event) => take(event.target.files?.[0])}
          />
          <button type="button" className="drop-btn" disabled={disabled} onClick={() => inputRef.current?.click()}>
            选择 .txt / .md
          </button>
          <p>文件只留在这次页面会话里，不会上传到服务器。不支持 PDF。</p>
        </div>
        {uploadError && (
          <p className="alert" role="alert">
            {uploadError}
          </p>
        )}

        {active && (
          <div className="prep">
            <div className="prep-h">
              <strong>已切分</strong>
              <span>
                {charCount(active.text)} 字 · {chunks.length} 段
              </span>
            </div>
            {chunks.length === 0 ? (
              <p className="quiet">这份文档没有可检索的正文。</p>
            ) : (
              <ol className="mini-chunks">
                {chunks.map((chunk) => (
                  <li key={chunk.id} className={chunk.id === hotChunkId ? "is-hot" : undefined}>
                    <b>{chunk.index + 1}</b>
                    <span>
                      {chunk.heading}
                      <small>{chunk.text.slice(0, 42)}</small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
        <p className="fineprint">青岚是虚构公司，只用于作品集演示。</p>
      </div>
    </section>
  );
}
