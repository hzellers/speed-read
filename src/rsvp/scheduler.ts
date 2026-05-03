import type { Token, WordToken } from "./tokenize";

export function wordDurationMs(token: Token, wpm: number): number {
  if (token.kind === "overlay") {
    return token.pauseAfterMs ?? 0;
  }
  return wordTokenDurationMs(token, wpm);
}

function wordTokenDurationMs(token: WordToken, wpm: number): number {
  const baseSec = 60 / wpm;
  let mult = 1;
  if (token.endsSentence) mult = 3;
  else if (token.endsClause) mult = 2;
  if (token.endsParagraph) mult = Math.max(mult, 3.5);
  if (token.speedMultiplier) mult /= token.speedMultiplier;

  const lengthBonusSec = Math.sqrt(token.word.length) * 0.04 * (300 / wpm);
  const baseMs = Math.round((baseSec * mult + lengthBonusSec) * 1000);
  if (token.pauseAfterMs) {
    return baseMs + token.pauseAfterMs;
  }
  return baseMs;
}
