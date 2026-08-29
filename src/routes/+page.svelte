<svelte:head>
  <title>PandaViewer</title>
</svelte:head>

<main class="shell">
  <header>
    <div class="brand-mark" aria-hidden="true">P</div>
    <strong>PandaViewer</strong>
    <span class="version">v0.0.1</span>
  </header>

  <section class="welcome" aria-labelledby="welcome-title">
    <div class="eyebrow">SCHNELL · FOKUSSIERT · PLATTFORMÜBERGREIFEND</div>
    <h1 id="welcome-title">Dokumente, nicht Ablenkungen.</h1>
    <p>
      Das Grundgerüst steht. Als Nächstes kommen Datei-E/A, CodeMirror und die
      formatgerechten Vorschauen für Markdown, JSON und LaTeX.
    </p>
    <div class="formats" aria-label="Geplante Formate">
      <span>TXT</span><span>MD</span><span>JSON</span><span>PY</span><span>TS</span><span>TEX</span>
    </div>
  </section>

  <footer>Lokale Entwicklung · MIT License</footer>
</main>

<style>
  .shell {
    display: grid;
    grid-template-rows: 54px 1fr 34px;
    width: 100vw;
    height: 100vh;
    background:
      radial-gradient(circle at 50% 42%, rgb(85 103 202 / 14%), transparent 38%),
      #111318;
  }

  header,
  footer {
    display: flex;
    align-items: center;
    border-color: #282c35;
    color: #aeb4c2;
  }

  header {
    gap: 10px;
    padding: 0 16px;
    border-bottom: 1px solid #282c35;
  }

  header strong {
    color: #f1f2f6;
    letter-spacing: -0.01em;
  }

  .brand-mark {
    display: grid;
    width: 27px;
    height: 27px;
    place-items: center;
    border-radius: 7px;
    color: #fff;
    background: #5b6fd8;
    font-size: 14px;
    font-weight: 800;
  }

  .version {
    margin-left: auto;
    font-size: 12px;
  }

  .welcome {
    align-self: center;
    justify-self: center;
    width: min(640px, calc(100vw - 48px));
    text-align: center;
  }

  .eyebrow {
    color: #7f8fe2;
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.16em;
  }

  h1 {
    margin: 18px 0 14px;
    color: #f5f6f9;
    font-size: clamp(34px, 5vw, 54px);
    letter-spacing: -0.045em;
    line-height: 1.02;
  }

  p {
    max-width: 570px;
    margin: 0 auto;
    color: #aeb4c2;
    font-size: 16px;
    line-height: 1.7;
  }

  .formats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-top: 28px;
  }

  .formats span {
    padding: 6px 9px;
    border: 1px solid #313745;
    border-radius: 6px;
    color: #c5cad5;
    background: #191c23;
    font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
  }

  footer {
    justify-content: center;
    border-top: 1px solid #282c35;
    font-size: 11px;
  }
</style>
