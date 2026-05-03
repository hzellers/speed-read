import type { Format } from "../store";

export type ExtractResult = { title: string; text: string; format: Format };

export async function extractText(file: File): Promise<ExtractResult> {
  const name = file.name;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const title = name.replace(/\.[^.]+$/, "");

  if (ext === "txt") {
    return { title, text: await file.text(), format: "plain" };
  }
  if (ext === "md" || ext === "markdown") {
    return { title, text: await file.text(), format: "markdown" };
  }
  if (ext === "docx") {
    const { default: mammoth } = await import("mammoth/mammoth.browser.js");
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return { title, text: result.value, format: "plain" };
  }
  if (ext === "pdf") {
    return { title, text: await extractPdf(file), format: "plain" };
  }
  throw new Error(`Unsupported file type: .${ext}`);
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
