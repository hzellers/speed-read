import "./styles.css";
import { Reader } from "./ui/reader";
import { extractText } from "./parsers";
import { load, save, type Format, type State } from "./store";
import { tokenizeMarkdown, type TocEntry } from "./markdown/tokenize";
import type { OverlayPayload, Token } from "./rsvp/tokenize";
import {
  hideOverlay,
  initOverlay,
  isOverlayOpen,
  showCodeOverlay,
  showImageOverlay,
  showTableOverlay,
  showTocOverlay,
} from "./ui/overlay";

const app = document.getElementById("app")!;
app.innerHTML = `
  <div class="progress"><div class="progress-bar" id="bar"></div></div>
  <div class="reader" id="tap">
    <div class="stage">
      <div class="guide top"></div>
      <div class="guide bot"></div>
      <div class="word" id="word"></div>
      <div class="idle-msg" id="idle">Tap anywhere for controls.<br/>Load a file or paste text to begin.</div>
    </div>
  </div>

  <div class="overlay hidden" id="overlay">
    <div class="overlay-content" id="overlay-content"></div>
    <div class="overlay-bar">
      <button class="primary" id="overlay-continue">Continue</button>
    </div>
  </div>

  <div class="controls" id="controls">
    <div class="row">
      <button class="primary" id="play">Play</button>
      <button class="icon" id="restart" aria-label="Restart">⟲</button>
      <button class="icon" id="toc" aria-label="Table of contents">☰</button>
      <button class="icon" id="source" aria-label="Source">＋</button>
    </div>
    <div class="row">
      <div class="wpm">
        <input type="range" id="wpm" min="100" max="800" step="10" />
        <div class="wpm-label"><b id="wpm-val">300</b> wpm</div>
      </div>
    </div>
  </div>

  <div class="sheet hidden" id="sheet">
    <h2 id="sheet-title">Source</h2>
    <div class="file-row">
      <button class="ghost" id="pick">Upload file</button>
      <input type="file" id="file" accept=".txt,.md,.markdown,.docx,.pdf" hidden />
    </div>
    <textarea id="paste" placeholder="Or paste text here…"></textarea>
    <div class="error" id="err"></div>
    <div class="actions">
      <button class="ghost" id="cancel">Cancel</button>
      <button class="primary" id="confirm">Read this</button>
    </div>
  </div>
`;

const state: State = load();

const wordEl = document.getElementById("word") as HTMLDivElement;
const idleEl = document.getElementById("idle") as HTMLDivElement;
const barEl = document.getElementById("bar") as HTMLDivElement;
const controlsEl = document.getElementById("controls") as HTMLDivElement;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const restartBtn = document.getElementById("restart") as HTMLButtonElement;
const tocBtn = document.getElementById("toc") as HTMLButtonElement;
const sourceBtn = document.getElementById("source") as HTMLButtonElement;
const wpmInput = document.getElementById("wpm") as HTMLInputElement;
const wpmVal = document.getElementById("wpm-val") as HTMLElement;
const tapEl = document.getElementById("tap") as HTMLDivElement;

const sheetEl = document.getElementById("sheet") as HTMLDivElement;
const pickBtn = document.getElementById("pick") as HTMLButtonElement;
const fileInput = document.getElementById("file") as HTMLInputElement;
const pasteEl = document.getElementById("paste") as HTMLTextAreaElement;
const errEl = document.getElementById("err") as HTMLDivElement;
const cancelBtn = document.getElementById("cancel") as HTMLButtonElement;
const confirmBtn = document.getElementById("confirm") as HTMLButtonElement;

let currentToc: TocEntry[] = [];

const reader = new Reader(wordEl, {
  onTick: (i, total) => {
    if (total > 0) barEl.style.width = `${(i / total) * 100}%`;
    state.index = i;
    save(state);
    updatePlayBtn();
  },
  onEnd: () => updatePlayBtn(),
  onOverlay: (payload: OverlayPayload) => {
    showOverlayFor(payload);
    updatePlayBtn();
  },
});

initOverlay({
  onContinue: () => {
    reader.play();
    updatePlayBtn();
  },
  onJumpTo: (tokenIndex: number) => {
    reader.seek(tokenIndex);
    reader.play();
    updatePlayBtn();
  },
});

function showOverlayFor(payload: OverlayPayload): void {
  hideControls();
  if (payload.type === "table") showTableOverlay(payload);
  else if (payload.type === "code") showCodeOverlay(payload);
  else if (payload.type === "image") showImageOverlay(payload);
}

function mdTokenizer(text: string): Token[] {
  const result = tokenizeMarkdown(text);
  currentToc = result.toc;
  return result.tokens;
}

function loadIntoReader(text: string, index: number, format: Format): void {
  reader.load(text, index, format, format === "markdown" ? mdTokenizer : undefined);
  if (format !== "markdown") currentToc = [];
}

wpmInput.value = String(state.wpm);
wpmVal.textContent = String(state.wpm);
reader.setWpm(state.wpm);

if (state.text) {
  loadIntoReader(state.text, state.index, state.format);
  idleEl.style.display = "none";
} else {
  idleEl.style.display = "";
}

let controlsVisible = false;
let hideTimer: number | null = null;

function showControls(autohide = true): void {
  controlsVisible = true;
  controlsEl.classList.add("visible");
  if (hideTimer) clearTimeout(hideTimer);
  if (autohide && reader.isPlaying()) {
    hideTimer = window.setTimeout(() => hideControls(), 2500);
  }
}
function hideControls(): void {
  controlsVisible = false;
  controlsEl.classList.remove("visible");
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

tapEl.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest(".controls, .sheet, .overlay")) return;
  if (isOverlayOpen()) return;
  if (controlsVisible) hideControls();
  else showControls();
});

playBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (reader.total() === 0) {
    openSheet();
    return;
  }
  reader.toggle();
  updatePlayBtn();
  if (reader.isPlaying()) showControls(true);
});

restartBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  reader.restart();
  updatePlayBtn();
});

tocBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (currentToc.length === 0) return;
  hideControls();
  reader.pause();
  showTocOverlay({
    title: state.title || "Untitled",
    wordCount: reader.total(),
    estMinutes: Math.max(1, Math.round(reader.total() / state.wpm)),
    toc: currentToc,
  });
});

sourceBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  openSheet();
});

wpmInput.addEventListener("input", () => {
  const v = Number(wpmInput.value);
  wpmVal.textContent = String(v);
  state.wpm = v;
  save(state);
  reader.setWpm(v);
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
});
wpmInput.addEventListener("change", () => {
  if (reader.isPlaying()) showControls(true);
});

function updatePlayBtn(): void {
  playBtn.textContent = reader.isPlaying() ? "Pause" : "Play";
  tocBtn.style.display = currentToc.length > 0 ? "" : "none";
}

function openSheet(): void {
  hideControls();
  errEl.textContent = "";
  pasteEl.value = "";
  sheetEl.classList.remove("hidden");
}
function closeSheet(): void {
  sheetEl.classList.add("hidden");
}

cancelBtn.addEventListener("click", closeSheet);
pickBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  errEl.textContent = "Loading…";
  try {
    const { title, text, format } = await extractText(file);
    state.title = title;
    state.text = text;
    state.format = format;
    state.index = 0;
    save(state);
    loadIntoReader(text, 0, format);
    idleEl.style.display = "none";
    closeSheet();
    if (format === "markdown" && currentToc.length > 0) {
      showTocOverlay({
        title: state.title,
        wordCount: reader.total(),
        estMinutes: Math.max(1, Math.round(reader.total() / state.wpm)),
        toc: currentToc,
      });
    }
  } catch (err) {
    errEl.textContent = err instanceof Error ? err.message : "Failed to read file";
  } finally {
    fileInput.value = "";
  }
});

confirmBtn.addEventListener("click", () => {
  const text = pasteEl.value.trim();
  if (!text) {
    errEl.textContent = "Nothing to read.";
    return;
  }
  state.text = text;
  state.format = "plain";
  state.index = 0;
  save(state);
  loadIntoReader(text, 0, "plain");
  idleEl.style.display = "none";
  closeSheet();
});

// Keyboard shortcut: Escape closes overlays.
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (isOverlayOpen()) {
      hideOverlay();
      reader.play();
      updatePlayBtn();
    } else if (!sheetEl.classList.contains("hidden")) {
      closeSheet();
    }
  } else if (e.key === " ") {
    if (reader.total() > 0 && !isOverlayOpen() && sheetEl.classList.contains("hidden")) {
      e.preventDefault();
      reader.toggle();
      updatePlayBtn();
    }
  }
});

updatePlayBtn();
if (!state.text) showControls(false);
