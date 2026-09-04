<script lang="ts">
  import { Hash, Table2 } from "@lucide/svelte";
  import {
    MAX_CSV_ROWS,
    delimiterLabel,
    parseCsv,
    type CsvDelimiterChoice,
    type CsvTable,
  } from "./csv";

  interface Props {
    content: string;
    fileName: string;
    fontSize?: number;
    theme?: "dark" | "light";
  }

  let { content, fileName, fontSize = 14, theme = "dark" }: Props = $props();

  let table = $state<CsvTable | null>(null);
  let delimiterChoice = $state<CsvDelimiterChoice>("auto");
  let headerRow = $state(true);
  let showRowNumbers = $state(true);

  const headerCells = $derived(table && headerRow ? table.rows[0] ?? [] : []);
  const bodyRows = $derived(table ? (headerRow ? table.rows.slice(1) : table.rows) : []);

  $effect(() => {
    const source = content;
    const name = fileName;
    const choice = delimiterChoice;
    const timer = window.setTimeout(() => {
      table = source.trim() ? parseCsv(source, choice, name) : null;
    }, 100);
    return () => window.clearTimeout(timer);
  });

  function columnLabel(index: number): string {
    let label = "";
    let value = index;
    do {
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26) - 1;
    } while (value >= 0);
    return label;
  }
</script>

<div class:light={theme === "light"} class="csv-preview" style={`--csv-font-size: ${fontSize}px`}>
  <div class="csv-toolbar">
    <label>
      <span>Trennzeichen</span>
      <select bind:value={delimiterChoice}>
        <option value="auto">Automatisch{table ? ` · ${delimiterLabel(table.delimiter)}` : ""}</option>
        <option value=",">Komma</option>
        <option value=";">Semikolon</option>
        <option value={"\t"}>Tabulator</option>
        <option value="|">Pipe</option>
      </select>
    </label>
    <button class:active={headerRow} title="Erste Zeile als Kopfzeile darstellen" onclick={() => (headerRow = !headerRow)}>
      <Table2 size={15} aria-hidden="true" />
      <span>Kopfzeile</span>
    </button>
    <button class:active={showRowNumbers} title="Zeilennummern ein-/ausblenden" onclick={() => (showRowNumbers = !showRowNumbers)}>
      <Hash size={15} aria-hidden="true" />
      <span>Zeilennummern</span>
    </button>
    {#if table}
      <span class="table-stats">
        {table.totalRows.toLocaleString("de-DE")} {table.totalRows === 1 ? "Zeile" : "Zeilen"} ·
        {table.columnCount.toLocaleString("de-DE")} {table.columnCount === 1 ? "Spalte" : "Spalten"}
      </span>
    {/if}
  </div>

  <div class="csv-scroll">
    {#if table && table.rows.length > 0}
      {#if table.truncatedRows || table.truncatedColumns}
        <div class="csv-notice" role="status">
          {#if table.truncatedRows}
            Es werden die ersten {MAX_CSV_ROWS.toLocaleString("de-DE")} Zeilen dargestellt; der Editor zeigt weiterhin die vollständige Datei.
          {/if}
          {#if table.truncatedColumns}
            Zeilen mit sehr vielen Spalten wurden gekürzt.
          {/if}
        </div>
      {/if}
      <table>
        <thead>
          <tr>
            {#if showRowNumbers}<th class="row-number" scope="col" aria-label="Zeile"></th>{/if}
            {#each { length: table.columnCount } as _, column}
              <th scope="col" class:numeric={table.numericColumns[column]}>
                {#if headerRow}
                  {headerCells[column] ?? ""}
                  <small>{columnLabel(column)}</small>
                {:else}
                  {columnLabel(column)}
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each bodyRows as row, rowIndex}
            <tr>
              {#if showRowNumbers}<td class="row-number">{rowIndex + 1 + (headerRow ? 1 : 0)}</td>{/if}
              {#each { length: table.columnCount } as _, column}
                <td class:numeric={table.numericColumns[column]} class:empty={!(row[column] ?? "").trim()}>{row[column] ?? ""}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-csv">
        <strong>Leere Tabellendatei</strong>
        <span>Kommagetrennte oder tabulatorgetrennte Werte werden hier als Tabelle dargestellt.</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .csv-preview {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    grid-template-rows: 36px minmax(0, 1fr);
    color: #d8dbe4;
    background: #111318;
  }

  .csv-toolbar {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border-bottom: 1px solid #292d36;
    background: #171a20;
  }

  .csv-toolbar label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #7f8797;
    font-size: 9px;
    text-transform: uppercase;
  }

  select {
    height: 26px;
    padding: 0 22px 0 8px;
    border: 1px solid #343945;
    border-radius: 5px;
    color: #cbd0da;
    background: #111419;
    font-size: 10px;
    text-transform: none;
  }

  .csv-toolbar button {
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

  .csv-toolbar button:hover,
  .csv-toolbar button.active {
    color: #e1e4eb;
    background: #242833;
  }

  .table-stats {
    overflow: hidden;
    margin-left: auto;
    color: #697283;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .csv-scroll {
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  .csv-notice {
    padding: 7px 12px;
    border-bottom: 1px solid #5d5435;
    color: #ddc277;
    background: #262219;
    font-size: 10px;
  }

  table {
    min-width: 100%;
    border-spacing: 0;
    border-collapse: separate;
    font-family: var(--font-mono);
    font-size: var(--csv-font-size);
  }

  th,
  td {
    max-width: 480px;
    padding: 5px 11px;
    overflow: hidden;
    border-right: 1px solid #262a33;
    border-bottom: 1px solid #262a33;
    text-align: left;
    text-overflow: ellipsis;
    vertical-align: top;
    white-space: pre;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    color: #eef0f5;
    background: #1d2028;
    font-weight: 650;
    white-space: nowrap;
  }

  th small {
    display: block;
    color: #6b7383;
    font-size: 0.72em;
    font-weight: 500;
  }

  .row-number {
    position: sticky;
    left: 0;
    z-index: 2;
    width: 1%;
    min-width: 42px;
    color: #6b7383;
    background: #171a20;
    text-align: right;
  }

  th.row-number {
    z-index: 3;
    background: #1d2028;
  }

  .numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  td.numeric {
    color: #d6a7df;
  }

  td.empty {
    background: rgb(255 255 255 / 2%);
  }

  tbody tr:nth-child(2n) td {
    background: #14171d;
  }

  tbody tr:nth-child(2n) td.row-number {
    background: #171a20;
  }

  tbody tr:hover td {
    background: rgb(113 131 231 / 8%);
  }

  .empty-csv {
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

  .empty-csv strong {
    color: #aab0bd;
    font-size: 13px;
  }

  .empty-csv span {
    max-width: 620px;
    font-size: 12px;
  }

  .csv-preview.light {
    color: #2d323d;
    background: #fff;
  }

  .light .csv-toolbar {
    border-color: #dfe2e8;
    background: #f6f7f9;
  }

  .light select {
    border-color: #d3d6de;
    color: #2e3440;
    background: #fff;
  }

  .light .csv-toolbar button:hover,
  .light .csv-toolbar button.active {
    color: #252a35;
    background: #e8eaf0;
  }

  .light th,
  .light td {
    border-color: #e1e4ea;
  }

  .light th {
    color: #202530;
    background: #eef0f4;
  }

  .light .row-number {
    color: #7c8595;
    background: #f5f6f8;
  }

  .light th.row-number {
    background: #eef0f4;
  }

  .light td.numeric {
    color: #8b4a9b;
  }

  .light tbody tr:nth-child(2n) td {
    background: #f9fafb;
  }

  .light tbody tr:nth-child(2n) td.row-number {
    background: #f5f6f8;
  }

  .light .csv-notice {
    border-color: #ded29e;
    color: #756321;
    background: #fffbea;
  }
</style>
