export async function extractText(file: File): Promise<{ title: string; text: string }> {
  const name = file.name;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const title = name.replace(/\.[^.]+$/, "");

  if (ext === "txt") {
    return { title, text: await file.text() };
  }
  if (ext === "md" || ext === "markdown") {
    return { title, text: stripMarkdown(await file.text()) };
  }
  if (ext === "docx") {
    const { default: mammoth } = await import("mammoth/mammoth.browser.js");
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return { title, text: result.value };
  }
  if (ext === "pdf") {
    return { title, text: await extractPdf(file) };
  }
  throw new Error(`Unsupported file type: .${ext}`);
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^---+$/gm, "")
    .replace(/<[^>]+>/g, "");
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it: any) => ("str" in it ? it.str : ""));
    pages.push(strings.join(" "));
  }
  return pages.join("\n\n");
}
