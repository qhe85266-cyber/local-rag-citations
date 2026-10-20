const QUERY_NOISE = [
  "什么时候",
  "怎么样",
  "为什么",
  "哪些内容",
  "可不可以",
  "能不能",
  "是否可以",
  "什么",
  "怎么",
  "如何",
  "哪些",
  "是否",
  "多少",
  "何时",
  "多久",
  "哪天",
  "哪里",
  "哪儿",
  "怎样",
  "规则",
  "政策",
  "介绍",
  "请问",
  "可以",
  "我们",
  "你们",
  "这个",
  "那个",
  "关于",
  "有关",
  "一下",
  "以及",
  "如果",
  "那么",
  "还是",
  "知道",
  "告诉",
  "想问",
  "到底",
  "具体",
  "分别",
].sort((a, b) => b.length - a.length);

const SPLIT_CHARS = new Set(
  "的了是在和与或及等把被从为以而也就都还很这那并但将啊呀吧呢嘛吗你我它她他里中到往给让向各该某请再最已所们能要".split(
    "",
  ),
);

const EXPANSIONS: Array<[string, string]> = [
  ["退钱", "退款"],
  ["退费", "退款"],
  ["多少钱", "价格"],
  ["收费", "月费"],
  ["救护车", "医疗救援"],
  ["医院", "医疗"],
  ["定位不准", "停留判断"],
];

export type QueryAnalysis = {
  tokens: string[];
  terms: string[];
  expansions: Array<{ from: string; to: string }>;
  expandedText: string;
};

export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const source = input.toLowerCase();

  for (const word of source.match(/[a-z]+/g) ?? []) {
    if (word.length >= 2) tokens.push(word);
  }
  for (const num of source.match(/\d+(?:\.\d+)?/g) ?? []) {
    tokens.push(num);
  }

  for (const seq of source.match(/[\u4e00-\u9fff]+/g) ?? []) {
    const chars = [...seq];
    for (const ch of chars) {
      if (!SPLIT_CHARS.has(ch)) tokens.push(ch);
    }
    for (let i = 0; i < chars.length - 1; i += 1) {
      const a = chars[i] ?? "";
      const b = chars[i + 1] ?? "";
      if (SPLIT_CHARS.has(a) && SPLIT_CHARS.has(b)) continue;
      tokens.push(a + b);
    }
  }

  return tokens;
}

const GAP_SKIP = new Set("会要能把该再".split(""));

/** Drop one stolen character when a match cuts into a different repeated word. */
function polishMatch(slice: string, remaining: string, corpus: string): string {
  if ([...slice].length <= 2) return slice;
  const last = [...slice].at(-1) ?? "";
  const stem = [...slice].slice(0, -1).join("");
  const followers = new Set<string>();
  let from = 0;
  while (from < corpus.length) {
    const at = corpus.indexOf(slice, from);
    if (at < 0) break;
    const next = corpus[at + slice.length] ?? "";
    if (/[\u4e00-\u9fff]/.test(next)) followers.add(next);
    from = at + 1;
  }
  for (const next of followers) {
    if (remaining.startsWith(slice + next)) continue;
    const glued = `${last}${next}`;
    if (corpus.split(glued).length - 1 >= 2) return stem;
  }
  return slice;
}

export type Coverage = {
  found: string[];
  missing: string[];
  coverage: number;
};

/** Content pieces of a question after question-words and particles are removed. */
export function contentSegments(question: string): string[] {
  let text = question.toLowerCase();
  for (const noise of QUERY_NOISE) text = text.split(noise).join(" ");

  const segments: string[] = [];
  for (const piece of text.split(/[^\u4e00-\u9fffa-z0-9.]+/)) {
    if (!piece) continue;
    if (/^[a-z0-9.]+$/.test(piece)) {
      if (piece.length >= 2 || /\d/.test(piece)) segments.push(piece);
      continue;
    }
    let buffer = "";
    const flush = () => {
      if ([...buffer].length >= 2) segments.push(buffer);
      buffer = "";
    };
    for (const ch of piece) {
      if (SPLIT_CHARS.has(ch)) flush();
      else buffer += ch;
    }
    flush();
  }
  return segments;
}

/**
 * Greedy longest match of the question against a document.
 * Coverage is by characters, so a short accidental overlap cannot look "complete".
 */
export function coverQuestion(question: string, corpus: string): Coverage {
  const found: string[] = [];
  const missing: string[] = [];
  let covered = 0;
  let total = 0;

  const pushMissing = (gap: string) => {
    const chars = [...gap];
    if (chars.length < 2) return;
    missing.push(gap);
    total += chars.length;
  };

  for (const segment of contentSegments(question)) {
    if (/^[a-z0-9.]+$/.test(segment)) {
      total += [...segment].length;
      if (corpus.toLowerCase().includes(segment)) {
        found.push(segment);
        covered += [...segment].length;
      } else {
        missing.push(segment);
      }
      continue;
    }

    const chars = [...segment];
    let index = 0;
    let gap = "";
    const flushGap = () => {
      pushMissing(gap);
      gap = "";
    };

    while (index < chars.length) {
      let match = "";
      const max = Math.min(8, chars.length - index);
      for (let len = max; len >= 2; len -= 1) {
        const slice = chars.slice(index, index + len).join("");
        if (corpus.includes(slice)) {
          match = polishMatch(slice, chars.slice(index).join(""), corpus);
          break;
        }
      }
      if (match) {
        flushGap();
        found.push(match);
        const len = [...match].length;
        covered += len;
        total += len;
        index += len;
        continue;
      }
      const ch = chars[index] ?? "";
      if (gap === "" && GAP_SKIP.has(ch)) {
        index += 1;
        continue;
      }
      gap += ch;
      index += 1;
    }
    flushGap();
  }

  return {
    found: [...new Set(found)],
    missing: [...new Set(missing)],
    coverage: total === 0 ? 0 : covered / total,
  };
}

export function analyzeQuery(question: string): QueryAnalysis {
  let expandedText = question;
  const expansions: Array<{ from: string; to: string }> = [];
  for (const [from, to] of EXPANSIONS) {
    if (expandedText.includes(from) && !expandedText.includes(to)) {
      expansions.push({ from, to });
      expandedText = expandedText.split(from).join(` ${to} `);
    }
  }

  const preview = coverQuestion(expandedText, expandedText);
  return {
    tokens: tokenize(expandedText),
    terms: preview.found,
    expansions,
    expandedText,
  };
}

export function charCount(text: string): number {
  return [...text.replace(/\s/g, "")].length;
}
