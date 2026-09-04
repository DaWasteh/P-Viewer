import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import type { Blockquote, Paragraph, Root, Text } from "mdast";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex, { type Options as KatexOptions } from "rehype-katex";
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

// Raw HTML never reaches this pipeline (remark-rehype drops it), so element ids
// only originate from headings and GFM footnotes. Both already carry the
// `user-content-` prefix from remark-rehype; a second sanitizer prefix would
// break the footnote links, therefore clobbering is left to remark-rehype.
const sanitizeSchema: Schema = {
  ...defaultSchema,
  clobberPrefix: "",
  tagNames: [...(defaultSchema.tagNames ?? []), "aside", "input"],
  attributes: {
    ...defaultSchema.attributes,
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
  svelte: svelteLike,
  vue: svelteLike,
  astro: svelteLike,
};

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkCallouts)
  .use(remarkRehype, {
    footnoteLabel: "Fußnoten",
    footnoteBackLabel: (referenceIndex, rereferenceIndex) =>
      `Zurück zu Verweis ${referenceIndex + 1}${rereferenceIndex > 1 ? `-${rereferenceIndex}` : ""}`,
  })
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeSlug)
  .use(rehypeKatex, katexOptions)
  .use(rehypeHighlight, {
    detect: false,
    languages: highlightLanguages,
    plainText: ["txt", "text", "plain", "plaintext", "nohighlight"],
  })
  .use(rehypeStringify);

const outlineParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

export function renderMarkdown(source: string): string {
  return String(renderer.processSync(source));
}

export function extractMarkdownHeadings(source: string): MarkdownHeading[] {
  const tree = outlineParser.parse(source);
  const slugger = new GithubSlugger();
  const headings: MarkdownHeading[] = [];

  visit(tree, "heading", (node) => {
    const text = toString(node).trim();
    if (!text) return;
    headings.push({
      id: slugger.slug(text),
      depth: node.depth,
      text,
    });
  });

  return headings;
}
