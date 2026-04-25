export type Token = {
  word: string;
  endsSentence: boolean;
  endsClause: boolean;
  endsParagraph: boolean;
};

const SENTENCE_END = /[.!?]["')\]]?$/;
const CLAUSE_END = /[,;:]["')\]]?$/;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const paragraphs = text.split(/\n\s*\n+/);

  paragraphs.forEach((para, pIdx) => {
    const words = para.split(/\s+/).filter(Boolean);
    words.forEach((raw, wIdx) => {
      const isLast = wIdx === words.length - 1;
      tokens.push({
        word: raw,
        endsSentence: SENTENCE_END.test(raw),
        endsClause: CLAUSE_END.test(raw),
        endsParagraph: isLast && pIdx < paragraphs.length - 1,
      });
    });
  });

  return splitLongWords(tokens);
}

function splitLongWords(tokens: Token[]): Token[] {
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
          word: p,
          endsSentence: last && t.endsSentence,
          endsClause: last && t.endsClause,
          endsParagraph: last && t.endsParagraph,
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
        word: c,
        endsSentence: last && t.endsSentence,
        endsClause: last && t.endsClause,
        endsParagraph: last && t.endsParagraph,
      });
    });
  }
  return out;
}
