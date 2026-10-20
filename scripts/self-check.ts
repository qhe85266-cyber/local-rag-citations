import { answerQuestion } from "../src/lib/answer";
import { chunkDocument } from "../src/lib/chunk";
import { fixtureDocs } from "../src/lib/fixtures";
import { buildUploadDoc, validateUpload } from "../src/lib/upload";
import type { Expectation, Grounding } from "../src/types";

let failed = 0;

function assert(condition: unknown, message: string) {
  if (condition) {
    console.log(`ok  ${message}`);
    return;
  }
  failed += 1;
  console.error(`FAIL  ${message}`);
}

const room = buildUploadDoc(
  "会议室说明.md",
  `# 松风会议室

西楼 3 层的松风会议室最多坐 8 人。使用前需要提前一个工作日在行政系统预约。室内没有固定投影仪，需要自行借用移动设备。
`,
);

const cases: Array<{
  docId: string;
  question: string;
  grounding: Grounding | Grounding[];
  includes?: string[];
  excludes?: string[];
  composer?: "curated" | "extractive" | "refusal";
}> = [];

for (const doc of fixtureDocs) {
  for (const item of doc.suggested) {
    const grounding: Grounding[] =
      item.expect === "refuse" ? ["none"] : item.expect === "partial" ? ["partial"] : ["strong", "partial"];
    cases.push({ docId: doc.id, question: item.question, grounding });
  }
}

cases.push(
  {
    docId: "support",
    question: "夜间安心的月费是多少？",
    grounding: ["strong", "partial"],
    includes: ["不包含会员定价"],
    excludes: ["19"],
    composer: "curated",
  },
  {
    docId: "night",
    question: "退款规则是什么？",
    grounding: ["strong"],
    includes: ["7 日内", "全额退款"],
    composer: "curated",
  },
  {
    docId: "night",
    question: "夜间安心提供医疗救援吗？",
    grounding: ["strong"],
    includes: ["不提供医疗救援"],
    composer: "curated",
  },
  {
    docId: "night",
    question: "青岚会收购竞争对手吗？",
    grounding: ["none"],
    composer: "refusal",
    includes: ["覆盖率"],
    excludes: ["相关度不够", "会收购"],
  },
  {
    docId: "night",
    question: "退钱可以吗？",
    grounding: ["strong", "partial"],
    includes: ["退款"],
  },
);

const night = fixtureDocs.find((doc) => doc.id === "night");
const support = fixtureDocs.find((doc) => doc.id === "support");
assert(night && !night.text.includes("12 元/月"), "产品说明不写学生月费");
assert(support && !support.text.includes("19 元"), "客服备忘不写 19 元");

for (const item of cases) {
  const doc = fixtureDocs.find((entry) => entry.id === item.docId);
  if (!doc) {
    assert(false, `missing doc ${item.docId}`);
    continue;
  }
  const chunks = chunkDocument(doc.text);
  const result = answerQuestion(doc, chunks, item.question);
  const allowed = Array.isArray(item.grounding) ? item.grounding : [item.grounding];
  const markers = [...result.text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
  const markerOk = markers.every((n) => result.citations.some((citation) => citation.n === n));
  console.log(
    [
      doc.id,
      result.grounding.padEnd(8),
      result.composer.padEnd(10),
      `score=${result.topScore.toFixed(2)}`,
      `cover=${result.coverage.toFixed(2)}`,
      `terms=${result.terms.join("/")}`,
      item.question,
    ].join("  "),
  );
  assert(allowed.includes(result.grounding), `${item.question} → ${result.grounding}，期望 ${allowed.join("|")}`);
  assert(markerOk, `${item.question} 的引用编号都能点到`);
  assert(
    result.grounding === "none" ? result.citations.length === 0 : result.citations.length > 0,
    `${item.question} 的引用数量与是否作答一致`,
  );
  for (const needle of item.includes ?? []) {
    assert(result.text.includes(needle), `${item.question} 应包含「${needle}」`);
  }
  for (const needle of item.excludes ?? []) {
    assert(!result.text.includes(needle), `${item.question} 不应包含「${needle}」`);
  }
  if (item.composer) assert(result.composer === item.composer, `${item.question} 成文方式为 ${item.composer}`);
}

const roomChunks = chunkDocument(room.text);
const roomHit = answerQuestion(room, roomChunks, "最多坐 8 人");
assert(roomHit.grounding !== "none", "上传文档能答出座位数");
assert(roomHit.text.includes("8"), "上传文档的答案里有 8");
assert(roomHit.citations.length > 0, "上传文档的答案带引用");
const roomMiss = answerQuestion(room, roomChunks, "周末开放吗");
assert(roomMiss.grounding === "none", "上传文档对没写过的问题拒答");

const empty = answerQuestion(room, [], "松风");
assert(empty.grounding === "none", "空正文拒答");

const long = "甲".repeat(30) + "。";
const repeated = Array.from({ length: 40 }, () => long).join("\n\n");
assert(chunkDocument(repeated).length > 1, "长文会被切开");
assert(chunkDocument("# 只有标题\n").length === 0, "只有标题时没有正文片段");

const fakeFile = { name: "扫描件.pdf", size: 12 } as File;
assert(
  validateUpload(fakeFile, "hello")?.includes("PDF"),
  "PDF 会给出中文错误",
);

const expectLabel: Record<Expectation, string> = {
  answer: "应引用",
  partial: "依据会偏弱",
  refuse: "应拒答",
};
assert(expectLabel.answer && expectLabel.partial && expectLabel.refuse, "三种预期都有文案");

if (failed > 0) {
  console.error(`\n${failed} checks failed`);
  process.exit(1);
}
console.log("\nall checks passed");
