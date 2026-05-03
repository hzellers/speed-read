import { marked, type Token as MdToken, type TokensList } from "marked";

export type ParsedMarkdown = {
  ast: TokensList;
  frontMatter: Record<string, string>;
  body: string;
};

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseMarkdown(source: string): ParsedMarkdown {
  const { frontMatter, body } = stripFrontMatter(source);
  const ast = marked.lexer(body, { gfm: true });
  return { ast, frontMatter, body };
}

function stripFrontMatter(source: string): { frontMatter: Record<string, string>; body: string } {
  const match = source.match(FRONT_MATTER_RE);
  if (!match) return { frontMatter: {}, body: source };
  const yaml = match[1];
  const fm: Record<string, string> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/);
    if (m) fm[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return { frontMatter: fm, body: source.slice(match[0].length) };
}

export type { MdToken };
