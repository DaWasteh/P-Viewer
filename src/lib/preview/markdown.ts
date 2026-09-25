import type { Blockquote, Content, Html, Paragraph, Parent, Root, Text } from "mdast";
import type { Element, Root as HastRoot } from "hast";
import { toString as hastToString } from "hast-util-to-string";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex, { type Options as KatexOptions } from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { common } from "lowlight";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import latex from "highlight.js/lib/languages/latex";
import elixir from "highlight.js/lib/languages/elixir";
import dart from "highlight.js/lib/languages/dart";
import scala from "highlight.js/lib/languages/scala";
import powershell from "highlight.js/lib/languages/powershell";
import dos from "highlight.js/lib/languages/dos";
import haskell from "highlight.js/lib/languages/haskell";
import julia from "highlight.js/lib/languages/julia";
import erlang from "highlight.js/lib/languages/erlang";
import clojure from "highlight.js/lib/languages/clojure";
import nginx from "highlight.js/lib/languages/nginx";
import protobuf from "highlight.js/lib/languages/protobuf";
import groovy from "highlight.js/lib/languages/groovy";
import gradle from "highlight.js/lib/languages/gradle";
import fortran from "highlight.js/lib/languages/fortran";
import ocaml from "highlight.js/lib/languages/ocaml";
import fsharp from "highlight.js/lib/languages/fsharp";
import crystal from "highlight.js/lib/languages/crystal";
import elm from "highlight.js/lib/languages/elm";
import coffeescript from "highlight.js/lib/languages/coffeescript";
import tcl from "highlight.js/lib/languages/tcl";
import cmake from "highlight.js/lib/languages/cmake";
import handlebars from "highlight.js/lib/languages/handlebars";
import http from "highlight.js/lib/languages/http";
import django from "highlight.js/lib/languages/django";
import x86asm from "highlight.js/lib/languages/x86asm";
import armasm from "highlight.js/lib/languages/armasm";
import matlab from "highlight.js/lib/languages/matlab";
import scheme from "highlight.js/lib/languages/scheme";
import lisp from "highlight.js/lib/languages/lisp";
import properties from "highlight.js/lib/languages/properties";
import gherkin from "highlight.js/lib/languages/gherkin";
import vhdl from "highlight.js/lib/languages/vhdl";
import verilog from "highlight.js/lib/languages/verilog";
import stylus from "highlight.js/lib/languages/stylus";
import nsis from "highlight.js/lib/languages/nsis";
import d from "highlight.js/lib/languages/d";
import nim from "highlight.js/lib/languages/nim";
import prolog from "highlight.js/lib/languages/prolog";
import awk from "highlight.js/lib/languages/awk";
import vim from "highlight.js/lib/languages/vim";
import glsl from "highlight.js/lib/languages/glsl";
import apache from "highlight.js/lib/languages/apache";
import pgsql from "highlight.js/lib/languages/pgsql";
import llvm from "highlight.js/lib/languages/llvm";
import haml from "highlight.js/lib/languages/haml";
import erb from "highlight.js/lib/languages/erb";
import smalltalk from "highlight.js/lib/languages/smalltalk";
import sml from "highlight.js/lib/languages/sml";
import ebnf from "highlight.js/lib/languages/ebnf";
import bnf from "highlight.js/lib/languages/bnf";
import abnf from "highlight.js/lib/languages/abnf";
import mipsasm from "highlight.js/lib/languages/mipsasm";
import avrasm from "highlight.js/lib/languages/avrasm";
import accesslog from "highlight.js/lib/languages/accesslog";
import dns from "highlight.js/lib/languages/dns";
import gcode from "highlight.js/lib/languages/gcode";
import svelteLike from "highlight.js/lib/languages/xml";

export interface MarkdownHeading {
  id: string;
  depth: number;
  text: string;
}

type CalloutKind = "note" | "tip" | "important" | "warning" | "caution";

const calloutPattern = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n)?/i;

function remarkCallouts() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const paragraph = node.children[0] as Paragraph | undefined;
      if (!paragraph || paragraph.type !== "paragraph") return;
      const first = paragraph.children[0] as Text | undefined;
      if (!first || first.type !== "text") return;

      const match = first.value.match(calloutPattern);
      if (!match) return;

      const kind = match[1].toLowerCase() as CalloutKind;
      first.value = first.value.slice(match[0].length);
      if (!first.value) paragraph.children.shift();
      if (paragraph.children.length === 0) node.children.shift();

      node.data = {
        ...node.data,
        hName: "aside",
        hProperties: {
          className: ["callout", `callout-${kind}`],
          dataCallout: kind,
        },
      };
    });
  };
}

type AlignedBlock = Parent & {
  type: "alignedBlock";
  data: { hName: "div"; hProperties: { align: string } };
};

const ALIGN_OPEN = /^<(div|p)\s+align\s*=\s*["']?(left|center|right)["']?\s*>$/i;
const ALIGN_CLOSE = /^<\/(div|p)>$/i;
const ALIGN_BLOCK = /^<(div|p)\s+align\s*=\s*["']?(left|center|right)["']?\s*>[ \t]*\n([\s\S]*?)\n?[ \t]*<\/\1>$/i;
const fragmentParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

function alignedBlock(alignment: string, children: Content[], position: Html["position"]): AlignedBlock {
  return {
    type: "alignedBlock",
    data: { hName: "div", hProperties: { align: alignment.toLowerCase() } },
    children,
    position: position ? { start: { ...position.start }, end: { ...position.end } } : undefined,
  } as AlignedBlock;
}

/**
 * Markdown has no alignment, so documents use `<div align="center">` (GitHub
 * renders it). These exact wrappers become aligned containers whose content is
 * still Markdown with its own source lines, also in the compact single HTML
 * block form where CommonMark would keep the inner Markdown as raw text. Both
 * the blank-line form (open tag, Markdown, close tag) and the compact form are
 * understood; all other raw HTML goes through rehype-raw.
 */
function remarkAlignment() {
  const transform = (parent: Parent) => {
    const output: Content[] = [];
    const open: AlignedBlock[] = [];
    for (const child of parent.children as Content[]) {
      if (child.type === "html") {
        const value = child.value.trim();
        const compact = ALIGN_BLOCK.exec(value);
        if (compact) {
          const fragment = fragmentParser.parse(compact[3]);
          // Inner lines start below the opening tag. rehype-raw maps positions
          // through offsets, so they are rebased onto the file as well.
          const position = child.position;
          const base = (position?.start.offset ?? 0) + child.value.indexOf(compact[3], child.value.indexOf(">") + 1);
          visit(fragment, (node) => {
            if (!node.position) return;
            if (!position) {
              node.position = undefined;
              return;
            }
            node.position.start.line += position.start.line;
            node.position.end.line += position.start.line;
            node.position.start.offset = (node.position.start.offset ?? 0) + base;
            node.position.end.offset = (node.position.end.offset ?? 0) + base;
          });
          const block = alignedBlock(compact[2], fragment.children as Content[], child.position);
          (open.at(-1)?.children ?? output).push(block as unknown as Content);
          continue;
        }
        const opening = ALIGN_OPEN.exec(value);
        if (opening) {
          const block = alignedBlock(opening[2], [], child.position);
          (open.at(-1)?.children ?? output).push(block as unknown as Content);
          open.push(block);
          continue;
        }
        if (ALIGN_CLOSE.test(value) && open.length > 0) {
          const block = open.pop()!;
          if (block.position && child.position) block.position.end = { ...child.position.end };
          continue;
        }
      }
      (open.at(-1)?.children ?? output).push(child);
    }
    parent.children = output as Parent["children"];
    for (const child of output) {
      if ("children" in child && (child.type === "blockquote" || child.type === "listItem" || child.type === "list" || (child as { type: string }).type === "alignedBlock")) {
        transform(child as Parent);
      }
    }
  };
  return (tree: Root) => transform(tree);
}

const SOURCE_MAPPED_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "aside",
  "pre", "table", "tr", "hr", "div", "dl", "dt", "dd", "img",
]);

/**
 * Tags block elements with the Markdown lines they come from, so the split
 * view can keep editor and preview aligned and a click in the preview can
 * jump to the source (issue #2). Values are plain line numbers.
 */
function rehypeSourceLines() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      const position = node.position;
      if (!position || !SOURCE_MAPPED_TAGS.has(node.tagName)) return;
      node.properties = {
        ...node.properties,
        dataSourceStart: String(position.start.line),
        dataSourceEnd: String(position.end.line),
      };
    });
  };
}

const CLOBBER_PREFIX = "user-content-";
const CLOBBERING_PROPERTIES = ["id", "name", "ariaDescribedBy", "ariaLabelledBy"] as const;

function withClobberPrefix(value: string): string {
  return value.startsWith(CLOBBER_PREFIX) ? value : CLOBBER_PREFIX + value;
}

/**
 * Raw HTML may bring its own `id` and `name` values, which would otherwise
 * become globals of the app window (DOM clobbering). They get GitHub's
 * `user-content-` prefix; footnote ids from remark-rehype already carry it, so
 * unlike the sanitizer's own clobbering this never prefixes twice. Heading
 * slugs are added afterwards and stay unprefixed like before.
 */
function rehypeClobberIds() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      const properties: Record<string, unknown> = node.properties;
      for (const key of CLOBBERING_PROPERTIES) {
        const value = properties[key];
        if (typeof value === "string" && value) properties[key] = withClobberPrefix(value);
        else if (Array.isArray(value)) properties[key] = value.map((item) => withClobberPrefix(String(item)));
      }
    });
  };
}

const HEADING_TAG = /^h([1-6])$/;

/**
 * Collects the outline from the rendered tree, so Markdown and HTML headings
 * both appear and share the ids rehype-slug gave them. Runs before KaTeX, so
 * formulas contribute their TeX source instead of rendered glyphs.
 */
function rehypeCollectHeadings() {
  return (tree: HastRoot, file: { data: Record<string, unknown> }) => {
    const headings: MarkdownHeading[] = [];
    visit(tree, "element", (node: Element) => {
      const depth = HEADING_TAG.exec(node.tagName)?.[1];
      if (!depth || headings.length >= MAX_MARKDOWN_HEADINGS) return;
      // The visually hidden footnote label is not part of the document outline.
      const className = node.properties.className;
      if (Array.isArray(className) && className.includes("sr-only")) return;
      const id = node.properties.id;
      const text = hastToString(node).trim();
      if (typeof id !== "string" || !text) return;
      headings.push({ id, depth: Number(depth), text });
    });
    file.data.headings = headings;
  };
}

// GitHub's schema already covers the HTML that READMEs use (img, table with
// width/align/colspan, details, br, b, …); only additions are listed here.
// Ids are prefixed by rehypeClobberIds instead of the sanitizer (see there).
const sanitizeSchema: Schema = {
  ...defaultSchema,
  clobberPrefix: "",
  // Contents of a stripped <style> would otherwise show up as plain text.
  strip: [...(defaultSchema.strip ?? []), "style"],
  tagNames: [...(defaultSchema.tagNames ?? []), "aside", "input"],
  attributes: {
    ...defaultSchema.attributes,
    // Source line numbers for the split view synchronisation; digits only.
    "*": [...(defaultSchema.attributes?.["*"] ?? []), ["dataSourceStart", /^\d{1,7}$/], ["dataSourceEnd", /^\d{1,7}$/]],
    aside: ["className", "dataCallout"],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-[\w-]+$/],
    ],
    input: [["type", "checkbox"], ["checked", true], ["disabled", true]],
    li: [...(defaultSchema.attributes?.li ?? []), "className"],
    ol: [...(defaultSchema.attributes?.ol ?? []), "className"],
    ul: [...(defaultSchema.attributes?.ul ?? []), "className"],
  },
};

const katexOptions: KatexOptions = {
  strict: "warn",
  trust: false,
};

// highlight.js grammars beyond lowlight's `common` set that documents in this
// app frequently embed. Aliases such as `sh`, `yml` or `ts` are built in.
const highlightLanguages = {
  ...common,
  dockerfile,
  latex,
  elixir,
  dart,
  scala,
  powershell,
  dos,
  haskell,
  julia,
  erlang,
  clojure,
  nginx,
  protobuf,
  groovy,
  gradle,
  fortran,
  ocaml,
  fsharp,
  crystal,
  elm,
  coffeescript,
  tcl,
  cmake,
  handlebars,
  http,
  django,
  x86asm,
  armasm,
  matlab,
  scheme,
  lisp,
  properties,
  gherkin,
  vhdl,
  verilog,
  stylus,
  nsis,
  d,
  nim,
  prolog,
  awk,
  vim,
  glsl,
  apache,
  pgsql,
  llvm,
  haml,
  erb,
  smalltalk,
  sml,
  ebnf,
  bnf,
  abnf,
  mipsasm,
  avrasm,
  accesslog,
  dns,
  gcode,
  svelte: svelteLike,
  vue: svelteLike,
  astro: svelteLike,
};

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkAlignment)
  .use(remarkCallouts)
  .use(remarkRehype, {
    // Only hands raw HTML on to rehype-raw; rehype-sanitize below still
    // removes scripts, event handlers and unsafe URLs (issue #6).
    allowDangerousHtml: true,
    footnoteLabel: "Fußnoten",
    footnoteBackLabel: (referenceIndex, rereferenceIndex) =>
      `Zurück zu Verweis ${referenceIndex + 1}${rereferenceIndex > 1 ? `-${rereferenceIndex}` : ""}`,
  })
  .use(rehypeRaw)
  .use(rehypeSourceLines)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeClobberIds)
  .use(rehypeSlug)
  .use(rehypeCollectHeadings)
  .use(rehypeKatex, katexOptions)
  .use(rehypeHighlight, {
    detect: false,
    languages: highlightLanguages,
    plainText: ["txt", "text", "plain", "plaintext", "nohighlight"],
  })
  .use(rehypeStringify);

export const MAX_MARKDOWN_CHARACTERS = 500_000;
export const MAX_MARKDOWN_LINES = 5_000;
export const MAX_MARKDOWN_HEADINGS = 300;

function guardMarkdown(source: string): void {
  let lines = 1;
  let markers = 0;
  if (source.length > MAX_MARKDOWN_CHARACTERS) throw new Error("Markdown-Vorschau auf 500.000 Zeichen begrenzt; der Quelltext bleibt vollständig verfügbar.");
  for (const c of source) {
    if (c === "\n" && ++lines > MAX_MARKDOWN_LINES) throw new Error("Markdown-Vorschau auf 5.000 Zeilen begrenzt; der Quelltext bleibt vollständig verfügbar.");
    if ("[]*_`$|>".includes(c) && ++markers > 20_000) throw new Error("Dieses Markdown ist für die Live-Vorschau zu komplex; bitte den Editor verwenden.");
  }
}

export interface RenderedMarkdown {
  html: string;
  /** Outline of the rendered document, including headings written as HTML. */
  headings: MarkdownHeading[];
}

export function renderMarkdownDocument(source: string): RenderedMarkdown {
  guardMarkdown(source);
  const file = renderer.processSync(source);
  return { html: String(file), headings: (file.data.headings as MarkdownHeading[] | undefined) ?? [] };
}

export function renderMarkdown(source: string): string {
  return renderMarkdownDocument(source).html;
}

export function decodeMarkdownFragment(fragment: string): string {
  try { return decodeURIComponent(fragment); } catch { return fragment; }
}
