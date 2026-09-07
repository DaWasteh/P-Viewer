import katex from "katex";
import { renderMarkdown } from "./markdown";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderNotebookMarkdown(source: string): string {
  try { return renderMarkdown(source); }
  catch { return `<p>Live-Darstellung begrenzt; Quelltext:</p><pre>${escapeHtml(source)}</pre>`; }
}

export function renderNotebookLatex(source: string): string {
  if (source.length > 20_000) return "<p>Formelausgabe für die Vorschau zu groß.</p>";
  const formula = source.trim().replace(/^\$\$([\s\S]*)\$\$$/, "$1").replace(/^\\\[([\s\S]*)\\\]$/, "$1").replace(/^\$([^$]*)\$$/, "$1");
  try { return katex.renderToString(formula, { displayMode: true, trust: false, throwOnError: false, maxExpand: 500, maxSize: 20, output: "htmlAndMathml" }); }
  catch { return `<pre>${escapeHtml(source)}</pre>`; }
}
