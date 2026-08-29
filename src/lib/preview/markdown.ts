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
          "data-callout": kind,
        },
      };
    });
  };
}

const sanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "aside", "input"],
  attributes: {
    ...defaultSchema.attributes,
    aside: ["className", "dataCallout"],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-[\w-]+$/],
    ],
    input: ["type", "checked", "disabled"],
    li: [...(defaultSchema.attributes?.li ?? []), "className"],
    ol: [...(defaultSchema.attributes?.ol ?? []), "className"],
    ul: [...(defaultSchema.attributes?.ul ?? []), "className"],
  },
};

const katexOptions: KatexOptions = {
  strict: "warn",
  trust: false,
};

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkCallouts)
  .use(remarkRehype)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeSlug)
  .use(rehypeKatex, katexOptions)
  .use(rehypeHighlight, { detect: false, plainText: ["txt", "text"] })
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
