import type { Element, Root, RootContent } from "hast";
import type { Schema } from "hast-util-sanitize";
import rehypeParse from "rehype-parse";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import {
  isRelativeImageSource,
  type LocalImagePayload,
} from "$lib/files/localImages";

export const MAX_HTML_PREVIEW_BYTES = 1024 * 1024;

export const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "media-src 'none'",
  "font-src 'none'",
  "manifest-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
].join("; ");

export interface HtmlPreviewResult {
  document: string;
  blockedResources: number;
  resolvedImages: number;
}

export type HtmlImageResolver = (
  sources: string[],
) => Promise<LocalImagePayload[]>;

export class HtmlPreviewTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super(
      `Die HTML-Datei ist mit ${formatBytes(bytes)} zu groß für die sichere Vorschau. ` +
        `Das Vorschau-Limit beträgt ${formatBytes(MAX_HTML_PREVIEW_BYTES)}.`,
    );
    this.name = "HtmlPreviewTooLargeError";
  }
}

const safeTags = [
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "main",
  "mark",
  "meter",
  "nav",
  "ol",
  "p",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
  "wbr",
];

const sanitizeSchema: Schema = {
  tagNames: safeTags,
  strip: [
    "applet",
    "button",
    "embed",
    "frame",
    "frameset",
    "iframe",
    "input",
    "noscript",
    "object",
    "option",
    "script",
    "select",
    "template",
    "textarea",
    "title",
  ],
  attributes: {
    "*": [
      "abbr",
      "ariaAtomic",
      "ariaBusy",
      "ariaCurrent",
      "ariaDescribedBy",
      "ariaDetails",
      "ariaDisabled",
      "ariaExpanded",
      "ariaHasPopup",
      "ariaHidden",
      "ariaLabel",
      "ariaLabelledBy",
      "ariaLevel",
      "ariaLive",
      "ariaModal",
      "ariaMultiline",
      "ariaMultiSelectable",
      "ariaOrientation",
      "ariaPlaceholder",
      "ariaPressed",
      "ariaReadOnly",
      "ariaRequired",
      "ariaRoleDescription",
      "ariaSelected",
      "ariaSort",
      "ariaValueMax",
      "ariaValueMin",
      "ariaValueNow",
      "ariaValueText",
      "className",
      "dir",
      "hidden",
      "id",
      "lang",
      "role",
      "style",
      "title",
    ],
    blockquote: ["cite"],
    col: ["span", "width"],
    colgroup: ["span", "width"],
    data: ["value"],
    details: ["open"],
    img: [
      "alt",
      "dataPreviewBlocked",
      "dataPreviewSource",
      "decoding",
      "height",
      "loading",
      "src",
      "width",
    ],
    ins: ["cite", "dateTime"],
    del: ["cite", "dateTime"],
    li: ["value"],
    meter: ["high", "low", "max", "min", "optimum", "value"],
    ol: ["reversed", "start", "type"],
    progress: ["max", "value"],
    table: ["summary"],
    td: ["colSpan", "headers", "rowSpan"],
    th: ["abbr", "colSpan", "headers", "rowSpan", "scope"],
    time: ["dateTime"],
  },
  protocols: {
    src: ["data"],
  },
  clobberPrefix: "p-viewer-preview-",
};

const parser = unified().use(rehypeParse);
const sanitizer = unified().use(rehypeSanitize, sanitizeSchema).use(rehypeStringify);
const safeDataImagePattern =
  /^data:image\/(?:png|jpeg|gif|webp|bmp|x-icon);base64,[a-z\d+/=\s]+$/i;
const languagePattern = /^[a-z]{1,8}(?:-[a-z\d]{1,8})*$/i;

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString("de-DE", {
    maximumFractionDigits: 2,
  })} MiB`;
}

function sourceBytes(source: string): number {
  if (source.length > MAX_HTML_PREVIEW_BYTES) return source.length;
  return new TextEncoder().encode(source).byteLength;
}

function controlledFragment(tree: Root): { fragment: Root; language: string } {
  const html = tree.children.find(
    (node): node is Element => node.type === "element" && node.tagName === "html",
  );
  if (!html) {
    return {
      fragment: {
        type: "root",
        children: tree.children.filter((node) => node.type !== "doctype"),
      },
      language: "und",
    };
  }

  const head = html.children.find(
    (node): node is Element => node.type === "element" && node.tagName === "head",
  );
  const body = html.children.find(
    (node): node is Element => node.type === "element" && node.tagName === "body",
  );
  const headStyles = (head?.children ?? []).filter(
    (node): node is Element => node.type === "element" && node.tagName === "style",
  );
  const languageValue = html.properties.lang;
  const language =
    typeof languageValue === "string" && languagePattern.test(languageValue)
      ? languageValue
      : "und";

  return {
    fragment: {
      type: "root",
      children: [...headStyles, ...((body?.children ?? []) as RootContent[])],
    },
    language,
  };
}

function sourceProperty(element: Element): string {
  const source = element.properties.src;
  return typeof source === "string" ? source.trim() : "";
}

function removeImageSource(element: Element): void {
  delete element.properties.src;
  delete element.properties.srcSet;
  element.properties.loading = "lazy";
  element.properties.decoding = "async";
}

function previewThemeCss(theme: "dark" | "light", fontSize: number): string {
  const foreground = theme === "dark" ? "#e7e9ef" : "#242933";
  const background = theme === "dark" ? "#111318" : "#ffffff";
  const border = theme === "dark" ? "#3a3f4b" : "#d7dae1";
  const safeFontSize = Number.isFinite(fontSize)
    ? Math.min(28, Math.max(11, fontSize))
    : 16;
  return `
:root { color-scheme: ${theme}; font-family: system-ui, sans-serif; font-size: ${safeFontSize}px; }
html, body { min-height: 100%; }
body { box-sizing: border-box; margin: 0; padding: 1rem; color: ${foreground}; background: ${background}; overflow-wrap: anywhere; }
*, *::before, *::after { box-sizing: inherit; }
img { max-width: 100%; height: auto; }
table { max-width: 100%; border-collapse: collapse; }
th, td { padding: 0.35rem 0.5rem; border: 1px solid ${border}; }
pre { max-width: 100%; overflow: auto; white-space: pre-wrap; }
a { color: inherit; text-decoration: underline dotted; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
`;
}

export async function renderHtmlPreview(
  source: string,
  theme: "dark" | "light" = "dark",
  resolveImages?: HtmlImageResolver,
  fontSize = 16,
): Promise<HtmlPreviewResult> {
  const bytes = sourceBytes(source);
  if (bytes > MAX_HTML_PREVIEW_BYTES) throw new HtmlPreviewTooLargeError(bytes);

  const parsed = parser.parse(source) as Root;
  const { fragment, language } = controlledFragment(parsed);
  let blockedResources = 0;
  let resolvedImages = 0;

  // Resource attributes are replaced with private markers before sanitizing. This
  // ensures images hidden inside stripped elements never trigger native file reads.
  visit(fragment, "element", (element: Element) => {
    if (element.tagName !== "img") return;
    delete element.properties.dataPreviewBlocked;
    delete element.properties.dataPreviewSource;
    const sourceValue = sourceProperty(element);
    removeImageSource(element);
    if (!sourceValue) return;
    if (safeDataImagePattern.test(sourceValue)) {
      element.properties.src = sourceValue;
    } else if (isRelativeImageSource(sourceValue)) {
      element.properties.dataPreviewSource = sourceValue;
    } else {
      element.properties.dataPreviewBlocked = "true";
    }
  });

  const cleanTree = sanitizer.runSync(fragment) as Root;
  const localSources: string[] = [];
  visit(cleanTree, "element", (element: Element) => {
    if (element.tagName !== "img") return;
    if (element.properties.dataPreviewBlocked === "true") {
      blockedResources += 1;
    }
    delete element.properties.dataPreviewBlocked;
    const sourceValue = element.properties.dataPreviewSource;
    if (typeof sourceValue === "string") localSources.push(sourceValue);
  });

  if (localSources.length > 0 && resolveImages) {
    const payloads = await resolveImages([...new Set(localSources)]);
    const bySource = new Map(payloads.map((payload) => [payload.source, payload]));
    visit(cleanTree, "element", (element: Element) => {
      if (element.tagName !== "img") return;
      const sourceValue = element.properties.dataPreviewSource;
      delete element.properties.dataPreviewSource;
      if (typeof sourceValue !== "string") return;
      const payload = bySource.get(sourceValue);
      if (payload?.dataUrl && safeDataImagePattern.test(payload.dataUrl)) {
        element.properties.src = payload.dataUrl;
        if (payload.path) element.properties.title = payload.path;
        resolvedImages += 1;
      } else {
        blockedResources += 1;
      }
    });
  } else if (localSources.length > 0) {
    blockedResources += localSources.length;
    visit(cleanTree, "element", (element: Element) => {
      delete element.properties.dataPreviewSource;
    });
  }

  const safeFragment = sanitizer.stringify(cleanTree);
  const document = `<!doctype html><html lang="${language}"><head><meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_CSP}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>P-Viewer HTML-Vorschau</title><style>${previewThemeCss(theme, fontSize)}</style></head><body>${safeFragment}</body></html>`;

  return { document, blockedResources, resolvedImages };
}
