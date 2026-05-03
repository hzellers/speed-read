export type WordStyle =
  | "bold"
  | "italic"
  | "bold-italic"
  | "code"
  | "link"
  | "bullet"
  | "announce"
  | "quote"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6";

export type WordToken = {
  kind: "word";
  word: string;
  endsSentence: boolean;
  endsClause: boolean;
  endsParagraph: boolean;
  style?: WordStyle;
  pauseAfterMs?: number;
  speedMultiplier?: number;
  indent?: number;
};

export type TableOverlay = {
  type: "table";
  html: string;
};

export type CodeOverlay = {
  type: "code";
  lang: string;
  code: string;
};

export type ImageOverlay = {
  type: "image";
  src: string;
  alt: string;
  title?: string;
};

export type OverlayPayload = TableOverlay | CodeOverlay | ImageOverlay;

export type OverlayToken = {
  kind: "overlay";
  payload: OverlayPayload;
  pauseAfterMs?: number;
};

export type Token = WordToken | OverlayToken;

const SENTENCE_END = /[.!?]["')\]]?$/;
const CLAUSE_END = /[,;:]["')\]]?$/;

export function tokenize(text: string): Token[] {
  const tokens: WordToken[] = [];
  const paragraphs = text.split(/\n\s*\n+/);

  paragraphs.forEach((para, pIdx) => {
    const words = para.split(/\s+/).filter(Boolean);
    words.forEach((raw, wIdx) => {
      const isLast = wIdx === words.length - 1;
      tokens.push({
        kind: "word",
        word: raw,
        endsSentence: SENTENCE_END.test(raw),
        endsClause: CLAUSE_END.test(raw),
        endsParagraph: isLast && pIdx < paragraphs.length - 1,
      });
    });
  });

  return splitLongWords(tokens);
}

export function splitLongWords(tokens: WordToken[]): Token[] {
  const out: Token[] = [];
  for (const t of tokens) {
    if (t.word.length <= 13) {
      out.push(t);
      continue;
    }
    const parts = t.word.split(/(?<=-)/);
    if (parts.length > 1 && parts.every((p) => p.length <= 13)) {
      parts.forEach((p, i) => {
        const last = i === parts.length - 1;
        out.push({
          ...t,
          word: p,
          endsSentence: last && t.endsSentence,
          endsClause: last && t.endsClause,
          endsParagraph: last && t.endsParagraph,
          pauseAfterMs: last ? t.pauseAfterMs : undefined,
        });
      });
      continue;
    }
    const chunks: string[] = [];
    for (let i = 0; i < t.word.length; i += 12) {
      chunks.push(t.word.slice(i, Math.min(i + 12, t.word.length)) + (i + 12 < t.word.length ? "-" : ""));
    }
    chunks.forEach((c, i) => {
      const last = i === chunks.length - 1;
      out.push({
        ...t,
        word: c,
        endsSentence: last && t.endsSentence,
        endsClause: last && t.endsClause,
        endsParagraph: last && t.endsParagraph,
        pauseAfterMs: last ? t.pauseAfterMs : undefined,
      });
    });
  }
  return out;
}
