import { useMemo, useRef, useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { DocPanel } from "./components/DocPanel";
import { TracePanel } from "./components/TracePanel";
import { answerQuestion } from "./lib/answer";
import { chunkDocument } from "./lib/chunk";
import { DEMO_STEPS, fixtureDocs } from "./lib/fixtures";
import { uid } from "./lib/id";
import { buildUploadDoc, validateUpload } from "./lib/upload";
import type { ChatMessage, SourceDoc } from "./types";

type Focus = { messageId: string; n: number; chunkId: string } | null;
type Tab = "docs" | "chat" | "trace";

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function App() {
  const [docs, setDocs] = useState<SourceDoc[]>(fixtureDocs);
  const [activeDocId, setActiveDocId] = useState(fixtureDocs[0]?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<1 | 2 | 3 | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const lock = useRef(false);

  const activeDoc = docs.find((doc) => doc.id === activeDocId) ?? docs[0];
  const chunks = useMemo(() => (activeDoc ? chunkDocument(activeDoc.text) : []), [activeDoc]);
  const activeAssistant = messages.find(
    (message): message is Extract<ChatMessage, { role: "assistant" }> =>
      message.role === "assistant" && message.id === activeMessageId,
  );

  function resetThread(nextBanner: string | null) {
    setMessages([]);
    setActiveMessageId(null);
    setFocus(null);
    setBanner(nextBanner);
    setComposerError(null);
  }

  function selectDoc(id: string) {
    if (lock.current || id === activeDocId) return;
    setActiveDocId(id);
    resetThread("已切换文档，对话已清空。现在只检索这一份。");
  }

  function removeDoc(id: string) {
    if (lock.current) return;
    setDocs((prev) => prev.filter((doc) => doc.id !== id));
    if (id === activeDocId) {
      setActiveDocId(fixtureDocs[0]?.id ?? "");
      resetThread("已移除上传文件，回到示例文档。");
    }
  }

  async function onUpload(file: File) {
    if (lock.current) return;
    let text = "";
    try {
      text = await file.text();
    } catch {
      setUploadError("读取文件失败，请重试。");
      return;
    }
    const error = validateUpload(file, text);
    if (error) {
      setUploadError(error);
      return;
    }
    const doc = buildUploadDoc(file.name, text);
    setDocs((prev) => {
      const uploads = [doc, ...prev.filter((item) => item.origin === "upload")].slice(0, 4);
      return [...fixtureDocs, ...uploads];
    });
    setActiveDocId(doc.id);
    setUploadError(null);
    resetThread("已打开你上传的文件。它只留在这次会话里，刷新后需要重新选择。");
    setTab("chat");
  }

  async function ask(question: string, docOverride?: SourceDoc, replace = false) {
    const text = question.trim();
    if (!text || lock.current) return;
    if ([...text].length > 200) {
      setComposerError("问题请控制在 200 字以内。");
      return;
    }
    const doc = docOverride ?? activeDoc;
    if (!doc) return;

    lock.current = true;
    setComposerError(null);
    setDraft("");
    const localChunks = chunkDocument(doc.text);
    const userMessage: ChatMessage = { id: uid("user"), role: "user", text };
    setMessages((prev) => [...(replace ? [] : prev), userMessage]);
    setPending(1);
    setTab("chat");

    try {
      await wait(160);
      setPending(2);
      const result = answerQuestion(doc, localChunks, text);
      await wait(220);
      setPending(3);
      await wait(140);
      const id = uid("assistant");
      const assistant: ChatMessage = { id, role: "assistant", question: text, result };
      setMessages((prev) => [...prev, assistant]);
      setActiveMessageId(id);
      const first = result.citations[0];
      setFocus(first ? { messageId: id, n: first.n, chunkId: first.chunkId } : null);
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  function runStep(step: (typeof DEMO_STEPS)[number]) {
    if (lock.current) return;
    const doc = docs.find((item) => item.id === step.docId) ?? fixtureDocs.find((item) => item.id === step.docId);
    if (!doc) return;
    const switched = doc.id !== activeDoc?.id;
    if (switched) setActiveDocId(doc.id);
    if (step.id === "fee") {
      setBanner("已换到《客服口径备忘》。检索不再包含产品说明，答案里不应出现 19 元。");
    } else if (switched) {
      setBanner("已切换文档，对话已清空。现在只检索这一份。");
    }
    void ask(step.question, doc, switched);
  }

  function openCitation(messageId: string, n: number, chunkId: string) {
    setActiveMessageId(messageId);
    setFocus({ messageId, n, chunkId });
    setTab("trace");
  }

  const lastUser = [...messages].reverse().find((message) => message.role === "user");

  return (
    <div className="app">
      <header className="mast">
        <div className="brand">
          <span className="seal" aria-hidden="true">
            据
          </span>
          <div>
            <h1>据引</h1>
            <p>Local RAG Citations</p>
          </div>
        </div>
        <p className="principle">先检索，再引用。文档没写的，就不回答。</p>
        <div className="mode">
          <strong>离线演示</strong>
          <span>无需 API Key</span>
        </div>
      </header>

      <div className="guide" aria-label="演示路径">
        <div className="guide-kicker">
          <b>演示路径</b>
          <span>浏览器内完成</span>
        </div>
        <div className="steps">
          {DEMO_STEPS.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={lastUser?.role === "user" && lastUser.text === step.question ? "step is-on" : "step"}
              disabled={pending !== null}
              onClick={() => runStep(step)}
            >
              <span className="step-index">{index + 1}</span>
              <span>
                <strong>{step.label}</strong>
                <small>{step.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="面板">
        {(
          [
            ["docs", "文档"],
            ["chat", "问答"],
            ["trace", "依据"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "is-on" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeDoc && (
        <main className="workspace">
          <div className={tab === "docs" ? "slot is-on" : "slot"}>
            <DocPanel
              docs={docs}
              activeId={activeDoc.id}
              chunks={chunks}
              hotChunkId={focus?.chunkId ?? null}
              uploadError={uploadError}
              disabled={pending !== null}
              onSelect={selectDoc}
              onRemove={removeDoc}
              onUpload={(file) => void onUpload(file)}
            />
          </div>
          <div className={tab === "chat" ? "slot is-on" : "slot"}>
            <ChatPanel
              doc={activeDoc}
              chunkCount={chunks.length}
              messages={messages}
              pending={pending}
              draft={draft}
              banner={banner}
              composerError={composerError}
              focus={focus}
              onDraft={setDraft}
              onAsk={(question) => void ask(question)}
              onCite={openCitation}
              onSelectMessage={(id) => {
                setActiveMessageId(id);
                const message = messages.find((item) => item.id === id);
                if (message?.role !== "assistant") return;
                const first = message.result.citations[0];
                setFocus(first ? { messageId: id, n: first.n, chunkId: first.chunkId } : null);
              }}
              onClear={() => resetThread("对话已清空。文档还在。")}
            />
          </div>
          <div className={tab === "trace" ? "slot is-on" : "slot"}>
            <TracePanel
              pending={pending}
              message={activeAssistant ?? null}
              focusChunkId={focus?.chunkId ?? null}
              onOpenChunk={(chunkId, n) => {
                if (!activeAssistant || !n) return;
                setFocus({ messageId: activeAssistant.id, n, chunkId });
              }}
            />
          </div>
        </main>
      )}
    </div>
  );
}
