<script lang="ts">
  import { Check, ChevronsDownUp, ChevronsUpDown, Copy, ListOrdered } from "@lucide/svelte";
  import JsonNode from "./JsonNode.svelte";
  import {
    countJsonNodes,
    parseJsonDocument,
    type JsonParseResult,
  } from "./json";

  interface Props {
    content: string;
    fileName: string;
    fontSize?: number;
    theme?: "dark" | "light";
  }

  let { content, fileName, fontSize = 14, theme = "dark" }: Props = $props();

  let result = $state<JsonParseResult>({});
  let sortKeys = $state(false);
  let expansionVersion = $state(0);
  let expandAll = $state(true);
  let copied = $state(false);

  const nodeCount = $derived(
    result.value === undefined ? 0 : countJsonNodes(result.value),
  );

  $effect(() => {
    const source = content;
    const name = fileName;
    const timer = window.setTimeout(() => {
      result = parseJsonDocument(source, name);
    }, 100);
    return () => window.clearTimeout(timer);
  });

  function setExpanded(value: boolean): void {
    expandAll = value;
    expansionVersion += 1;
  }

  async function copyFormatted(): Promise<void> {
    if (result.value === undefined) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.value, null, 2));
      copied = true;
      window.setTimeout(() => (copied = false), 1_500);
    } catch {
      copied = false;
    }
  }
</script>

<div class:light={theme === "light"} class="json-preview" style={`--json-font-size: ${fontSize}px`}>
  <div class="json-toolbar">
    <button class:active={sortKeys} title="Objektschlüssel alphabetisch sortieren" onclick={() => (sortKeys = !sortKeys)}>
      <ListOrdered size={15} aria-hidden="true" />
      <span>Schlüssel sortieren</span>
    </button>
    <span class="separator"></span>
    <button title="Alle Knoten aufklappen" onclick={() => setExpanded(true)}>
      <ChevronsUpDown size={15} aria-hidden="true" />
      <span>Aufklappen</span>
    </button>
    <button title="Alle Knoten einklappen" onclick={() => setExpanded(false)}>
      <ChevronsDownUp size={15} aria-hidden="true" />
      <span>Einklappen</span>
    </button>
    <button class="copy-button" title="Formatiertes JSON kopieren" onclick={() => void copyFormatted()} disabled={result.value === undefined}>
      {#if copied}<Check size={15} aria-hidden="true" />{:else}<Copy size={15} aria-hidden="true" />{/if}
      <span>{copied ? "Kopiert" : "Kopieren"}</span>
    </button>
    {#if nodeCount > 0}<span class="node-count">{nodeCount.toLocaleString("de-DE")} Knoten</span>{/if}
  </div>

  <div class="json-scroll">
    {#if result.error}
      <div class="json-error" role="alert">
        <strong>Ungültiges JSON</strong>
        <span>{result.error}</span>
        {#if result.line && result.column}
          <code>Zeile {result.line}, Spalte {result.column}</code>
        {/if}
      </div>
    {:else if result.value !== undefined}
      <div class="tree" role="tree" aria-label="JSON-Struktur">
        <JsonNode
          value={result.value}
          keyName={null}
          {sortKeys}
          {expansionVersion}
          {expandAll}
          {theme}
        />
      </div>
    {:else}
      <div class="empty-json">
        <strong>Leeres JSON-Dokument</strong>
        <span>Objekte und Arrays werden hier als einklappbarer Baum dargestellt.</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .json-preview {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    grid-template-rows: 36px minmax(0, 1fr);
    color: #d8dbe4;
    background: #111318;
  }

  .json-toolbar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0 8px;
    border-bottom: 1px solid #292d36;
    background: #171a20;
  }

  .json-toolbar button {
    display: flex;
    height: 27px;
    align-items: center;
    gap: 5px;
    padding: 0 7px;
    border: 0;
    border-radius: 5px;
    color: #929aa9;
    background: transparent;
    cursor: pointer;
    font-size: 10px;
  }

  .json-toolbar button:hover:not(:disabled),
  .json-toolbar button.active {
    color: #e1e4eb;
    background: #242833;
  }

  .json-toolbar button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .separator {
    width: 1px;
    height: 18px;
    margin: 0 3px;
    background: #30343e;
  }

  .copy-button {
    margin-left: auto;
  }

  .node-count {
    margin-left: 5px;
    color: #697283;
    font-size: 9px;
  }

  .json-scroll {
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  .tree {
    min-width: max-content;
    min-height: 100%;
    padding: 18px 24px 80px 10px;
    font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
    font-size: var(--json-font-size);
  }

  .json-error,
  .empty-json {
    display: flex;
    min-height: 100%;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    padding: 24px;
    color: #737c8d;
    text-align: center;
  }

  .json-error strong {
    color: #ef9a9f;
  }

  .json-error code {
    padding: 4px 7px;
    border-radius: 4px;
    color: #c7ccd6;
    background: #20242c;
    font-size: 11px;
  }

  .json-error span,
  .empty-json span {
    max-width: 620px;
    font-size: 12px;
  }

  .empty-json strong {
    color: #aab0bd;
    font-size: 13px;
  }

  .json-preview.light {
    color: #2d323d;
    background: #fff;
  }

  .light .json-toolbar {
    border-color: #dfe2e8;
    background: #f6f7f9;
  }

  .light .json-toolbar button:hover:not(:disabled),
  .light .json-toolbar button.active {
    color: #252a35;
    background: #e8eaf0;
  }
</style>
