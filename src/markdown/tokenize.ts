import { marked, type Tokens } from "marked";
import {
  splitLongWords,
  type OverlayToken,
  type Token,
  type WordStyle,
  type WordToken,
} from "../rsvp/tokenize";
import { parseMarkdown } from "./parse";
import { renderTableHtml } from "./render";

export type TocEntry = { depth: number; text: string; tokenIndex: number };

export type MarkdownTokenizeResult = {
  tokens: Token[];
  toc: TocEntry[];
  frontMatter: Record<string, string>;
};

const SENTENCE_END = /[.!?]["')\]]?$/;
const CLAUSE_END = /[,;:]["')\]]?$/;

const NUM_WORDS: Record<number, string> = {
  0: "zero", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
  6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
  11: "eleven", 12: "twelve",
};

function num(n: number): string {
  return NUM_WORDS[n] ?? String(n);
}

function langName(raw: string): string {
  const map: Record<string, string> = {
    js: "JavaScript", javascript: "JavaScript",
    ts: "TypeScript", typescript: "TypeScript",
    py: "Python", python: "Python",
    sh: "shell", bash: "Bash", zsh: "Zsh",
    rb: "Ruby", go: "Go", rs: "Rust",
    cs: "C#", cpp: "C++", c: "C",
    md: "Markdown", markdown: "Markdown",
    json: "JSON", yaml: "YAML", yml: "YAML",
    html: "HTML", css: "CSS", scss: "SCSS",
    sql: "SQL", graphql: "GraphQL",
    tsx: "TypeScript", jsx: "JavaScript",
  };
  if (!raw) return "";
  const key = raw.toLowerCase().split(/\s/)[0];
  return map[key] ?? raw;
}

function ordinalRow(n: number): string {
  const names: Record<number, string> = {
    1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
    6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
  };
  return names[n] ?? String(n);
}

function plainText(tokens: Tokens.Generic[] | undefined, fallback: string): string {
  if (!tokens) return fallback;
  let out = "";
  for (const t of tokens) {
    const tt = t as any;
    if (typeof tt.text === "string") out += tt.text;
    else if (tt.tokens) out += plainText(tt.tokens, "");
    else if (tt.raw) out += tt.raw;
  }
  return out || fallback;
}

class TokenBuilder {
  private words: WordToken[] = [];
  private out: Token[] = [];
  private heading: { count: number; total: number } = { count: 0, total: 0 };

  setHeadingTotal(total: number): void {
    this.heading.total = total;
  }

  push(word: string, opts: Partial<WordToken> = {}): void {
    if (!word) return;
    this.words.push({
      kind: "word",
      word,
      endsSentence: SENTENCE_END.test(word),
      endsClause: CLAUSE_END.test(word),
      endsParagraph: false,
      ...opts,
    });
  }

  pushAll(text: string, opts: Partial<WordToken> = {}): void {
    const ws = text.split(/\s+/).filter(Boolean);
    for (const w of ws) this.push(w, opts);
  }

  endParagraph(): void {
    if (this.words.length === 0) return;
    this.words[this.words.length - 1].endsParagraph = true;
  }

  pause(ms: number): void {
    if (this.words.length === 0) return;
    const last = this.words[this.words.length - 1];
    last.pauseAfterMs = (last.pauseAfterMs ?? 0) + ms;
  }

  pushOverlay(payload: OverlayToken["payload"], pauseAfterMs?: number): void {
    this.flush();
    this.out.push({ kind: "overlay", payload, pauseAfterMs });
  }

  nextHeadingNumber(): number {
    this.heading.count += 1;
    return this.heading.count;
  }

  totalHeadings(): number {
    return this.heading.total;
  }

  currentTokenIndex(): number {
    return this.out.length + this.words.length;
  }

  private flush(): void {
    if (this.words.length === 0) return;
    const expanded = splitLongWords(this.words);
    this.out.push(...expanded);
    this.words = [];
  }

  build(): Token[] {
    this.flush();
    return this.out;
  }
}

function countHeadings(ast: Tokens.Generic[]): number {
  let n = 0;
  for (const t of ast) {
    if (t.type === "heading") n += 1;
  }
  return n;
}

function emitInline(b: TokenBuilder, tokens: Tokens.Generic[] | undefined, baseStyle?: WordStyle, baseOpts: Partial<WordToken> = {}): void {
  if (!tokens) return;
  for (const t of tokens) {
    emitInlineToken(b, t, baseStyle, baseOpts);
  }
}

function combineStyle(a: WordStyle | undefined, b: WordStyle): WordStyle {
  if (!a) return b;
  if ((a === "bold" && b === "italic") || (a === "italic" && b === "bold")) return "bold-italic";
  return b;
}

function emitInlineToken(b: TokenBuilder, t: Tokens.Generic, baseStyle: WordStyle | undefined, baseOpts: Partial<WordToken>): void {
  const opts = { ...baseOpts };
  switch (t.type) {
    case "text":
    case "escape": {
      const text = (t as Tokens.Text).text ?? "";
      if ((t as Tokens.Text).tokens) {
        emitInline(b, (t as Tokens.Text).tokens as any, baseStyle, opts);
      } else {
        b.pushAll(decodeEntities(text), { ...opts, style: baseStyle });
      }
      return;
    }
    case "strong":
      emitInline(b, (t as Tokens.Strong).tokens as any, combineStyle(baseStyle, "bold"), opts);
      return;
    case "em":
      emitInline(b, (t as Tokens.Em).tokens as any, combineStyle(baseStyle, "italic"), opts);
      return;
    case "del":
      emitInline(b, (t as Tokens.Del).tokens as any, baseStyle, opts);
      return;
    case "codespan":
      b.pushAll((t as Tokens.Codespan).text, { ...opts, style: "code" });
      return;
    case "link": {
      const link = t as Tokens.Link;
      emitInline(b, link.tokens as any, "link", opts);
      return;
    }
    case "image":
      emitImage(b, t as Tokens.Image);
      return;
    case "br":
      return;
    case "html": {
      const text = stripHtml((t as Tokens.HTML).text ?? "");
      if (text) b.pushAll(text, { ...opts, style: baseStyle });
      return;
    }
    default: {
      const anyT = t as any;
      if (anyT.tokens) emitInline(b, anyT.tokens, baseStyle, opts);
      else if (typeof anyT.text === "string") b.pushAll(anyT.text, { ...opts, style: baseStyle });
    }
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function emitHeading(b: TokenBuilder, h: Tokens.Heading, toc: TocEntry[]): void {
  const n = b.nextHeadingNumber();
  const total = b.totalHeadings();
  const tocIndex = b.currentTokenIndex();
  const text = plainText(h.tokens as any, h.text);
  toc.push({ depth: h.depth, text, tokenIndex: tocIndex });

  // Natural-language announcement.
  if (h.depth === 1) {
    b.pushAll(`The next section, heading ${num(n)} of ${num(total)}, is titled:`, { style: "announce" });
  } else {
    b.pushAll(
      `The next section, heading ${num(n)} of ${num(total)} at level ${num(h.depth)}, is titled:`,
      { style: "announce" },
    );
  }
  const headingStyle = (`heading-${h.depth}` as WordStyle);
  emitInline(b, h.tokens as any, headingStyle);
  b.endParagraph();
  b.pause(1500);
}

function emitParagraph(b: TokenBuilder, p: Tokens.Paragraph): void {
  emitInline(b, p.tokens as any);
  b.endParagraph();
}

function emitBlockquote(b: TokenBuilder, q: Tokens.Blockquote): void {
  b.pushAll("What follows is a quotation.", { style: "announce" });
  b.pause(300);
  for (const child of q.tokens as Tokens.Generic[]) {
    if (child.type === "paragraph") {
      emitInline(b, (child as Tokens.Paragraph).tokens as any, "quote", { speedMultiplier: 0.85 });
      b.endParagraph();
    } else {
      emitBlock(b, child, [], []);
    }
  }
  b.pushAll("That's the end of the quotation.", { style: "announce" });
  b.pause(400);
}

function emitList(b: TokenBuilder, list: Tokens.List, depth: number): void {
  const k = list.items.length;
  const kindLabel = list.ordered ? "numbered" : "bulleted";
  const lead = depth > 0 ? "Sub-list. " : "";
  b.pushAll(
    `${lead}What follows is a ${kindLabel} list with ${num(k)} ${k === 1 ? "item" : "items"}.`,
    { style: "announce" },
  );
  b.pause(400);

  list.items.forEach((item, i) => {
    const prefix = list.ordered ? `${(typeof list.start === "number" ? list.start : 1) + i}.` : "•";
    b.push(prefix, { style: "bullet", indent: depth });
    emitListItem(b, item, depth);
    if (i < list.items.length - 1) b.pause(400);
  });
  b.pushAll("That's the end of the list.", { style: "announce" });
  b.pause(400);
}

function emitListItem(b: TokenBuilder, item: Tokens.ListItem, depth: number): void {
  if (item.task) {
    b.pushAll(item.checked ? "Task, done:" : "Task, to do:", { style: "announce" });
  }
  for (const child of item.tokens as Tokens.Generic[]) {
    if (child.type === "text") {
      const tt = child as Tokens.Text;
      if (tt.tokens) emitInline(b, tt.tokens as any);
      else b.pushAll(tt.text);
    } else if (child.type === "paragraph") {
      emitInline(b, (child as Tokens.Paragraph).tokens as any);
    } else if (child.type === "list") {
      emitList(b, child as Tokens.List, depth + 1);
    } else {
      emitBlock(b, child, [], []);
    }
  }
}

function describeTable(b: TokenBuilder, table: Tokens.Table): void {
  const cols = table.header.length;
  const rows = table.rows.length;
  const headerNames = table.header.map((c) => plainText(c.tokens as any, c.text).trim());
  const colList = listSentence(headerNames);
  b.pushAll(
    `Coming up, a table with ${num(cols)} ${cols === 1 ? "column" : "columns"} and ${num(rows)} ${rows === 1 ? "row" : "rows"}.`,
    { style: "announce" },
  );
  b.pushAll(`The columns are: ${colList}.`, { style: "announce" });
  b.pause(400);

  const maxRowsToNarrate = 6;
  const narrated = Math.min(rows, maxRowsToNarrate);
  for (let r = 0; r < narrated; r++) {
    const row = table.rows[r];
    b.pushAll(`Row ${ordinalRow(r + 1)}.`, { style: "announce" });
    for (let c = 0; c < row.length; c++) {
      const colName = headerNames[c] ?? `column ${num(c + 1)}`;
      const cellText = plainText(row[c].tokens as any, row[c].text).trim();
      if (!cellText) {
        b.pushAll(`Under ${colName}, the cell is empty.`, { style: "announce" });
      } else {
        b.pushAll(`Under ${colName}:`, { style: "announce" });
        b.pushAll(cellText);
      }
    }
    b.pause(300);
  }
  if (rows > narrated) {
    const remaining = rows - narrated;
    b.pushAll(
      `There are ${num(remaining)} more ${remaining === 1 ? "row" : "rows"}; tap the table that follows to read them.`,
      { style: "announce" },
    );
    b.pause(400);
  }
}

function emitTable(b: TokenBuilder, table: Tokens.Table): void {
  describeTable(b, table);
  b.pushOverlay({ type: "table", html: renderTableHtml(table) });
}

function emitCode(b: TokenBuilder, code: Tokens.Code): void {
  const lang = langName(code.lang ?? "");
  const lines = code.text.split(/\r?\n/).length;
  if (lang) {
    b.pushAll(
      `Coming up next is a ${lang} code block, ${num(lines)} ${lines === 1 ? "line" : "lines"} long.`,
      { style: "announce" },
    );
  } else {
    b.pushAll(
      `Coming up next is a code block, ${num(lines)} ${lines === 1 ? "line" : "lines"} long.`,
      { style: "announce" },
    );
  }
  b.pushAll("The display will pause so you can read it; tap continue when you're ready.", { style: "announce" });
  b.pushOverlay({ type: "code", lang: code.lang ?? "", code: code.text });
}

function emitImage(b: TokenBuilder, img: Tokens.Image): void {
  const alt = (img.text || "").trim();
  if (alt) {
    b.pushAll("There's an image here. The description reads:", { style: "announce" });
    b.pushAll(alt);
  } else {
    b.pushAll("There's an image here, with no description.", { style: "announce" });
  }
  b.pushOverlay({ type: "image", src: img.href, alt, title: img.title ?? undefined });
}

function emitHr(b: TokenBuilder): void {
  b.pushAll("There's a section break here.", { style: "announce" });
  b.pause(2000);
}

function emitHtmlBlock(b: TokenBuilder, html: Tokens.HTML | Tokens.Tag): void {
  const text = stripHtml(html.text);
  if (text) b.pushAll(text);
  b.endParagraph();
}

function listSentence(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
}

function emitBlock(b: TokenBuilder, t: Tokens.Generic, toc: TocEntry[], _ancestors: string[]): void {
  switch (t.type) {
    case "space":
      return;
    case "heading":
      emitHeading(b, t as Tokens.Heading, toc);
      return;
    case "paragraph":
      emitParagraph(b, t as Tokens.Paragraph);
      return;
    case "blockquote":
      emitBlockquote(b, t as Tokens.Blockquote);
      return;
    case "list":
      emitList(b, t as Tokens.List, 0);
      return;
    case "table":
      emitTable(b, t as Tokens.Table);
      return;
    case "code":
      emitCode(b, t as Tokens.Code);
      return;
    case "hr":
      emitHr(b);
      return;
    case "html":
      emitHtmlBlock(b, t as Tokens.HTML);
      return;
    case "def":
      return;
    case "image":
      emitImage(b, t as Tokens.Image);
      return;
    default: {
      const anyT = t as any;
      if (anyT.tokens) emitInline(b, anyT.tokens);
      else if (typeof anyT.text === "string") b.pushAll(anyT.text);
      b.endParagraph();
    }
  }
}

export function tokenizeMarkdown(source: string): MarkdownTokenizeResult {
  const { ast, frontMatter } = parseMarkdown(source);
  const b = new TokenBuilder();
  b.setHeadingTotal(countHeadings(ast as any));
  const toc: TocEntry[] = [];
  for (const t of ast) emitBlock(b, t as any, toc, []);
  return { tokens: b.build(), toc, frontMatter };
}

// Re-export the built-in marked types for use elsewhere.
export type { Tokens } from "marked";
export { marked };
