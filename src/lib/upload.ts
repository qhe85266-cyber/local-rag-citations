import { chunkDocument } from "./chunk";
import { suggestionsForUpload } from "./fixtures";
import { uid } from "./id";
import type { SourceDoc } from "../types";

export const MAX_UPLOAD_BYTES = 200 * 1024;

export function validateUpload(file: File, text: string): string | null {
  const name = file.name.toLowerCase();
  const allowed =
    name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown");
  if (!allowed) return "请上传 .txt 或 .md 文件。演示版不解析 PDF。";
  if (file.size > MAX_UPLOAD_BYTES) return "文件超过 200KB。请精简后再试。";
  if (!text.trim()) return "文件是空的，没有可以检索的文本。";
  if (looksBinary(text)) return "这个文件不像纯文本。请另存为 .txt 或 .md 后再上传。";
  return null;
}

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4000);
  let bad = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code === 0 || (code < 9) || (code > 13 && code < 32)) bad += 1;
  }
  return bad > 6;
}

export function buildUploadDoc(filename: string, text: string): SourceDoc {
  const heading = text.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  const bareName = filename.replace(/\.(txt|md|markdown)$/i, "");
  const title = (heading || bareName || "未命名文档").slice(0, 28);
  const plain = text.replace(/#{1,3}\s+/g, "").replace(/\s+/g, " ").trim();
  const chunks = chunkDocument(text);

  return {
    id: uid("upload"),
    title,
    kicker: "本地上传 · 刷新即消失",
    summary: plain.slice(0, 52) || "本地文本",
    text,
    origin: "upload",
    filename,
    suggested: suggestionsForUpload(chunks.map((chunk) => chunk.heading)),
    scripts: [],
  };
}
