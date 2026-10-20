import type { Chunk } from "../types";

const MAX_CHARS = 420;

function splitLong(body: string): string[] {
  const clean = body.replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= MAX_CHARS) return [clean];

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const units: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_CHARS) {
      units.push(paragraph);
      continue;
    }
    const sentences = paragraph.split(/(?<=[。！？；])/);
    let buffer = "";
    for (const sentence of sentences) {
      if ((buffer + sentence).length > MAX_CHARS && buffer.trim()) {
        units.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer += sentence;
      }
    }
    if (buffer.trim()) units.push(buffer.trim());
  }

  const packed: string[] = [];
  let current = "";
  for (const unit of units) {
    const next = current ? `${current}\n\n${unit}` : unit;
    if (next.length > MAX_CHARS && current) {
      packed.push(current.trim());
      current = unit;
    } else {
      current = next;
    }
  }
  if (current.trim()) packed.push(current.trim());
  return packed.length ? packed : [clean.slice(0, MAX_CHARS)];
}

export function chunkDocument(raw: string): Chunk[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const sections: Array<{ heading: string; body: string }> = [];
  let heading = "正文";
  let buffer: string[] = [];
  let sawHeading = false;

  const flush = () => {
    const body = buffer.join("\n").trim();
    buffer = [];
    if (!body) return;
    sections.push({ heading, body });
  };

  for (const line of lines) {
    const match = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (match) {
      flush();
      heading = match[1] ?? "正文";
      sawHeading = true;
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (sawHeading && sections.length === 0) return [];
  const source = sawHeading ? sections : [{ heading: "正文", body: text }];
  const chunks: Chunk[] = [];

  for (const section of source) {
    const parts = splitLong(section.body);
    parts.forEach((part, partIndex) => {
      chunks.push({
        id: `c${chunks.length}`,
        index: chunks.length,
        heading:
          parts.length > 1 ? `${section.heading} · ${partIndex + 1}` : section.heading,
        text: part,
      });
    });
  }

  return chunks.slice(0, 80);
}

export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[。！？])\s*/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 8);
}
