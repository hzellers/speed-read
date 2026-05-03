import { marked, type Tokens } from "marked";

export function renderTableHtml(table: Tokens.Table): string {
  return marked.parser([table as any]);
}

export function renderCodeHtml(lang: string, code: string): string {
  const escaped = esc(code);
  const langClass = lang ? ` class="lang-${esc(lang)}"` : "";
  return `<pre><code${langClass}>${escaped}</code></pre>`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
