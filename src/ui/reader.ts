import { tokenize, type OverlayPayload, type Token, type WordToken } from "../rsvp/tokenize";
import { splitAtPivot } from "../rsvp/orp";
import { wordDurationMs } from "../rsvp/scheduler";
import type { Format } from "../store";

export type ReaderEvents = {
  onTick: (index: number, total: number) => void;
  onEnd: () => void;
  onOverlay?: (payload: OverlayPayload) => void;
};

export type Tokenizer = (text: string) => Token[];

export class Reader {
  private tokens: Token[] = [];
  private idx = 0;
  private timer: number | null = null;
  private playing = false;
  private wpm = 300;
  private tokenizer: Tokenizer = tokenize;

  constructor(
    private wordEl: HTMLElement,
    private events: ReaderEvents,
  ) {}

  load(text: string, startIndex = 0, format: Format = "plain", mdTokenizer?: Tokenizer): void {
    this.pause();
    this.tokenizer = format === "markdown" && mdTokenizer ? mdTokenizer : tokenize;
    this.tokens = this.tokenizer(text);
    this.idx = Math.min(Math.max(0, startIndex), Math.max(0, this.tokens.length - 1));
    this.renderCurrent();
    this.events.onTick(this.idx, this.tokens.length);
  }

  setWpm(wpm: number): void {
    this.wpm = wpm;
    if (this.playing) {
      this.scheduleNext();
    }
  }

  getIndex(): number {
    return this.idx;
  }

  total(): number {
    return this.tokens.length;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  seek(index: number): void {
    this.pause();
    this.idx = Math.min(Math.max(0, index), Math.max(0, this.tokens.length - 1));
    this.renderCurrent();
    this.events.onTick(this.idx, this.tokens.length);
  }

  play(): void {
    if (this.tokens.length === 0) return;
    if (this.idx >= this.tokens.length) {
      this.idx = 0;
    }
    this.playing = true;
    this.scheduleNext();
  }

  pause(): void {
    this.playing = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  restart(): void {
    this.pause();
    this.idx = 0;
    this.renderCurrent();
    this.events.onTick(this.idx, this.tokens.length);
  }

  private scheduleNext(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    if (!this.playing) return;
    const token = this.tokens[this.idx];
    if (!token) {
      this.playing = false;
      this.events.onEnd();
      return;
    }
    if (token.kind === "overlay") {
      this.playing = false;
      this.events.onTick(this.idx, this.tokens.length);
      this.idx += 1;
      this.events.onOverlay?.(token.payload);
      return;
    }
    this.renderCurrent();
    this.events.onTick(this.idx, this.tokens.length);
    const delay = wordDurationMs(token, this.wpm);
    this.timer = window.setTimeout(() => {
      this.idx += 1;
      if (this.idx >= this.tokens.length) {
        this.playing = false;
        this.renderEnd();
        this.events.onTick(this.tokens.length, this.tokens.length);
        this.events.onEnd();
        return;
      }
      this.scheduleNext();
    }, delay);
  }

  private renderCurrent(): void {
    const t = this.tokens[this.idx];
    if (!t) {
      this.wordEl.innerHTML = "";
      this.wordEl.className = "word";
      return;
    }
    if (t.kind === "overlay") {
      this.wordEl.innerHTML = "";
      this.wordEl.className = "word";
      return;
    }
    this.renderWord(t);
  }

  private renderWord(t: WordToken): void {
    const { left, pivot, right } = splitAtPivot(t.word);
    const leftLen = [...left].length;
    this.wordEl.style.transform = `translate(calc(-${leftLen}ch - 0.5ch), -50%)`;
    const cells = [
      ...[...left].map((c) => `<span class="ch">${esc(c)}</span>`),
      `<span class="ch pivot">${esc(pivot)}</span>`,
      ...[...right].map((c) => `<span class="ch">${esc(c)}</span>`),
    ].join("");
    this.wordEl.innerHTML = cells;
    const classes = ["word"];
    if (t.style) classes.push(`style-${t.style}`);
    this.wordEl.className = classes.join(" ");
  }

  private renderEnd(): void {
    this.wordEl.style.transform = `translate(-50%, -50%)`;
    this.wordEl.className = "word";
    this.wordEl.innerHTML = `<span class="right" style="color:var(--dim);font-size:0.6em">end</span>`;
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
