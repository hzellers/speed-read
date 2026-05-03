import type { CodeOverlay, ImageOverlay, TableOverlay } from "../rsvp/tokenize";

export type TocOverlayData = {
  title: string;
  wordCount: number;
  estMinutes: number;
  toc: { depth: number; text: string; tokenIndex: number }[];
};

type Handlers = {
  onContinue: () => void;
  onJumpTo?: (tokenIndex: number) => void;
};

let handlers: Handlers = { onContinue: () => {} };
let overlayEl: HTMLElement | null = null;
let contentEl: HTMLElement | null = null;
let continueBtn: HTMLButtonElement | null = null;
let jumpHandler: ((e: Event) => void) | null = null;

export function initOverlay(opts: Handlers): void {
  handlers = opts;
  overlayEl = document.getElementById("overlay");
  contentEl = document.getElementById("overlay-content");
  continueBtn = document.getElementById("overlay-continue") as HTMLButtonElement | null;
  if (!overlayEl || !contentEl || !continueBtn) {
    throw new Error("Overlay elements missing from DOM");
  }
  continueBtn.addEventListener("click", () => {
    hideOverlay();
    handlers.onContinue();
  });
}

export function isOverlayOpen(): boolean {
  return !!overlayEl && !overlayEl.classList.contains("hidden");
}

export function hideOverlay(): void {
  if (!overlayEl || !contentEl) return;
  overlayEl.classList.add("hidden");
  if (jumpHandler) {
    contentEl.removeEventListener("click", jumpHandler);
    jumpHandler = null;
  }
  contentEl.innerHTML = "";
  contentEl.scrollTop = 0;
}

function show(html: string, continueLabel = "Continue"): void {
  if (!overlayEl || !contentEl || !continueBtn) return;
  contentEl.innerHTML = html;
  contentEl.scrollTop = 0;
  continueBtn.textContent = continueLabel;
  overlayEl.classList.remove("hidden");
}

export function showTableOverlay(payload: TableOverlay): void {
  show(`<div class="overlay-table">${payload.html}</div>`);
}

export function showCodeOverlay(payload: CodeOverlay): void {
  const langClass = payload.lang ? ` lang-${escapeAttr(payload.lang)}` : "";
  show(
    `<pre class="overlay-code${langClass}"><code>${escapeHtml(payload.code)}</code></pre>`,
  );
}

export function showImageOverlay(payload: ImageOverlay): void {
  const safeSrc = payload.src.startsWith("data:") || /^https?:\/\//.test(payload.src) || payload.src.startsWith("/")
    ? payload.src
    : "";
  const imgHtml = safeSrc
    ? `<img class="overlay-image" src="${escapeAttr(safeSrc)}" alt="${escapeAttr(payload.alt)}"/>`
    : `<div class="overlay-missing">Image source unavailable: <code>${escapeHtml(payload.src)}</code></div>`;
  const caption = payload.alt
    ? `<div class="overlay-caption">${escapeHtml(payload.alt)}</div>`
    : "";
  show(`<div class="overlay-image-wrap">${imgHtml}${caption}</div>`);
}

export function showTocOverlay(data: TocOverlayData): void {
  if (!overlayEl || !contentEl || !continueBtn) return;
  const items = data.toc
    .map(
      (e) => `<li class="toc-item depth-${e.depth}" data-jump="${e.tokenIndex}">
          <span class="toc-marker">§</span>
          <span class="toc-text">${escapeHtml(e.text)}</span>
        </li>`,
    )
    .join("");
  const tocHtml = data.toc.length > 0
    ? `<ol class="toc-list">${items}</ol>`
    : `<div class="toc-empty">No headings found.</div>`;

  show(
    `<div class="toc">
      <h1 class="toc-title">${escapeHtml(data.title || "Untitled")}</h1>
      <div class="toc-meta">${data.wordCount.toLocaleString()} tokens · about ${data.estMinutes} min at current pace</div>
      <div class="toc-hint">Tap a heading to start there, or hit Start reading.</div>
      ${tocHtml}
    </div>`,
    "Start reading",
  );

  if (jumpHandler) contentEl.removeEventListener("click", jumpHandler);
  jumpHandler = (e: Event) => {
    const li = (e.target as HTMLElement).closest(".toc-item") as HTMLElement | null;
    if (!li) return;
    const idx = Number(li.dataset.jump);
    if (Number.isNaN(idx)) return;
    hideOverlay();
    handlers.onJumpTo?.(idx);
  };
  contentEl.addEventListener("click", jumpHandler);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
