<script lang="ts">
  import { untrack } from "svelte";
  import { ChevronRight } from "@lucide/svelte";
  import JsonNode from "./JsonNode.svelte";
  import type { JsonValue } from "./json";

  interface Props {
    value: JsonValue;
    keyName?: string | null;
    depth?: number;
    isLast?: boolean;
    sortKeys?: boolean;
    expansionVersion?: number;
    expandAll?: boolean;
    theme?: "dark" | "light";
  }

  let {
    value,
    keyName = null,
    depth = 0,
    isLast = true,
    sortKeys = false,
    expansionVersion = 0,
    expandAll = true,
    theme = "dark",
  }: Props = $props();

  let expanded = $state(untrack(() => depth < 2));
  let previousValue = untrack(() => value);

  const isArray = $derived(Array.isArray(value));
  const isObject = $derived(value !== null && typeof value === "object" && !isArray);
  const isContainer = $derived(isArray || isObject);
  const childCount = $derived(
    isArray
      ? (value as JsonValue[]).length
      : isObject
        ? Object.keys(value as Record<string, JsonValue>).length
        : 0,
  );
  const entries = $derived.by((): Array<[string, JsonValue]> => {
    if (isArray) {
      return (value as JsonValue[]).map((item, index) => [String(index), item]);
    }
    if (isObject) {
      const objectEntries = Object.entries(value as Record<string, JsonValue>);
      if (sortKeys) objectEntries.sort(([left], [right]) => left.localeCompare(right));
      return objectEntries;
    }
    return [];
  });

  $effect(() => {
    if (expansionVersion > 0) expanded = expandAll;
  });

  $effect(() => {
    if (value === previousValue) return;
    previousValue = value;
    expanded = depth < 2;
  });

  function primitiveClass(): string {
    if (value === null) return "null";
    return typeof value;
  }

  function primitiveText(): string {
    if (typeof value === "string") return JSON.stringify(value);
    if (value === null) return "null";
    return String(value);
  }
</script>

<div class:light={theme === "light"} class="json-node" style={`--depth: ${depth}`}>
  <div class="node-line">
    {#if isContainer}
      <button
        class:expanded
        class="toggle"
        aria-label={expanded ? "Knoten einklappen" : "Knoten aufklappen"}
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    {:else}
      <span class="toggle-spacer"></span>
    {/if}

    {#if keyName !== null}
      <span class="key">{isArray ? keyName : JSON.stringify(keyName)}</span><span class="colon">:</span>
    {/if}

    {#if isContainer}
      <button class="container-value" onclick={() => (expanded = !expanded)} tabindex="-1">
        <span class="bracket">{isArray ? "[" : "{"}</span>
        {#if !expanded}
          <span class="summary">{childCount} {isArray ? "Einträge" : "Schlüssel"}</span>
          <span class="bracket">{isArray ? "]" : "}"}</span>
        {/if}
      </button>
    {:else}
      <span class:value-string={typeof value === "string"} class:value-number={typeof value === "number"} class:value-boolean={typeof value === "boolean"} class:value-null={value === null} class="primitive {primitiveClass()}">{primitiveText()}</span>{#if !isLast}<span class="comma">,</span>{/if}
    {/if}
  </div>

  {#if isContainer && expanded}
    <div class="children">
      {#each entries as [childKey, childValue], index (childKey)}
        <JsonNode
          value={childValue}
          keyName={childKey}
          depth={depth + 1}
          isLast={index === entries.length - 1}
          {sortKeys}
          {expansionVersion}
          {expandAll}
          {theme}
        />
      {/each}
    </div>
    <div class="closing-line">
      <span class="toggle-spacer"></span>
      <span class="bracket">{isArray ? "]" : "}"}</span>{#if !isLast}<span class="comma">,</span>{/if}
    </div>
  {/if}
</div>

<style>
  .json-node {
    min-width: max-content;
  }

  .node-line,
  .closing-line {
    display: flex;
    min-height: 25px;
    align-items: flex-start;
    padding-left: calc(var(--depth) * 18px);
    line-height: 25px;
  }

  .node-line:hover,
  .closing-line:hover {
    background: rgb(113 131 231 / 6%);
  }

  .toggle,
  .toggle-spacer {
    display: inline-grid;
    flex: 0 0 20px;
    width: 20px;
    height: 25px;
    place-items: center;
  }

  .toggle {
    padding: 0;
    border: 0;
    color: #747d8e;
    background: transparent;
    cursor: pointer;
    transition: transform 100ms ease;
  }

  .toggle.expanded {
    transform: rotate(90deg);
  }

  .toggle:hover {
    color: #c1c7d3;
  }

  .key {
    color: #8fb4ef;
  }

  .colon,
  .comma {
    color: #737b8b;
  }

  .colon {
    margin-right: 7px;
  }

  .container-value {
    display: inline-flex;
    height: 25px;
    align-items: center;
    gap: 7px;
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    cursor: pointer;
    font: inherit;
  }

  .bracket {
    color: #c8ccd5;
  }

  .summary {
    color: #6e7788;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 10px;
    font-style: italic;
  }

  .value-string {
    color: #b7d58b;
  }

  .value-number {
    color: #d6a7df;
  }

  .value-boolean {
    color: #dfaa77;
  }

  .value-null {
    color: #7d8596;
    font-style: italic;
  }

  .light .node-line:hover,
  .light .closing-line:hover {
    background: rgb(70 93 205 / 6%);
  }

  .light .toggle,
  .light .colon,
  .light .comma {
    color: #818897;
  }

  .light .key {
    color: #315fa1;
  }

  .light .bracket {
    color: #4d5563;
  }

  .light .summary,
  .light .value-null {
    color: #747c8a;
  }

  .light .value-string {
    color: #477a2f;
  }

  .light .value-number {
    color: #8b4a9b;
  }

  .light .value-boolean {
    color: #a05c26;
  }
</style>
