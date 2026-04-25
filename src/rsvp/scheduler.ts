import type { Token } from "./tokenize";

export function wordDurationMs(token: Token, wpm: number): number {
  const baseSec = 60 / wpm;
  let mult = 1;
  if (token.endsSentence) mult = 3;
  else if (token.endsClause) mult = 2;
  if (token.endsParagraph) mult = Math.max(mult, 3.5);

  const lengthBonusSec = Math.sqrt(token.word.length) * 0.04 * (300 / wpm);
  return Math.round((baseSec * mult + lengthBonusSec) * 1000);
}
