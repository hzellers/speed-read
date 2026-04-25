const PIVOT_TABLE = [0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];

export function pivotIndex(word: string): number {
  const stripped = word.replace(/[^A-Za-z0-9'’]/g, "");
  const len = stripped.length || word.length;
  if (len < PIVOT_TABLE.length) return PIVOT_TABLE[len];
  return 4;
}

export function splitAtPivot(word: string): { left: string; pivot: string; right: string } {
  const idx = pivotIndex(word);
  const safe = Math.min(idx, Math.max(0, word.length - 1));
  return {
    left: word.slice(0, safe),
    pivot: word.slice(safe, safe + 1),
    right: word.slice(safe + 1),
  };
}
