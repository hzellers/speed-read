const KEY = "speed-read:v1";

export type State = {
  text: string;
  title: string;
  index: number;
  wpm: number;
};

const DEFAULT: State = {
  text: "",
  title: "",
  index: 0,
  wpm: 300,
};

export function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

export function save(state: State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}
