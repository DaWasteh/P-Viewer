import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  extractKatexMacros,
  parseColumnAlignments,
  renderLatexLive,
} from "./latex";

describe("bundled LaTeX live renderer", () => {
  it("renders document structure, lists, emphasis and formulas", () => {
    const result = renderLatexLive(String.raw`
      \documentclass{article}
      \title{Offline \LaTeX{} Vorschau}
      \author{Ada \and Emmy}
      \begin{document}
      \maketitle
      \section{Einführung}
      Ein \textbf{wichtiger} Satz mit $E = mc^2$.

      \begin{itemize}
      \item Erster Punkt
      \item Zweiter Punkt
      \end{itemize}

      \[
        \int_0^1 x^2\,dx = \frac{1}{3}
      \]
      \end{document}
    `);

    expect(result.html).toContain("Offline LaTeX Vorschau");
    expect(result.html).toContain('<span class="latex-number">1</span> Einführung</h2>');
    expect(result.html).toContain("<strong>wichtiger</strong>");
    expect(result.html).toContain("<ul>");
    expect(result.html).toContain("<li>Erster Punkt</li>");
    expect(result.html).toContain('class="katex"');
    expect(result.html).toContain('class="katex-display"');
    expect(result.truncated).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("escapes source HTML and never creates executable links", () => {
    const result = renderLatexLive(String.raw`
      \begin{document}
      <script>alert('x')</script>
      \href{javascript:alert(1)}{Nicht ausführen}
      \end{document}
    `);

    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("href=");
    expect(result.html).toContain("Nicht ausführen");
  });

  it("keeps escaped percent signs and removes comments", () => {
    const result = renderLatexLive(String.raw`
      \begin{document}
      50\% sichtbar % unsichtbarer Kommentar
      \end{document}
    `);

    expect(result.html).toContain("50% sichtbar");
    expect(result.html).not.toContain("unsichtbarer Kommentar");
  });

  it("renders verbatim content as escaped code", () => {
    const result = renderLatexLive(String.raw`
      \begin{document}
      \begin{verbatim}
      <unsafe>% remains literal
      \end{verbatim}
      Inline \verb|a % b| bleibt.
      \end{document}
    `);

    expect(result.html).toContain('class="latex-code"');
    expect(result.html).toContain("&lt;unsafe&gt;% remains literal");
    expect(result.html).toContain("<code>a % b</code>");
  });

  it("bounds pathological math input", () => {
    const result = renderLatexLive(`$${"x".repeat(50_001)}$`);
    expect(result.warnings).toContain(
      "Eine Formel überschreitet das Live-Limit von 50.000 Zeichen.",
    );
    expect(result.html).toContain("latex-math-error");
  });

  it("uses bundled KaTeX macros from the preamble including arguments", () => {
    const result = renderLatexLive(String.raw`
      \newcommand{\RR}{\mathbb{R}}
      \newcommand{\vect}[1]{\mathbf{#1}}
      \DeclareMathOperator{\tr}{tr}
      \begin{document}
      $\vect{x} \in \RR$ und $\tr A$
      \end{document}
    `);

    expect(result.html).toContain('mathvariant="double-struck"');
    expect(result.html).toContain("mathbf");
    expect(result.html).toContain("tr");
    expect(result.html).not.toContain("katex-error");
    expect(result.warnings).toEqual([]);
  });

  it("extracts macros with nested braces and skips unsupported defaults", () => {
    const macros = extractKatexMacros(String.raw`
      \newcommand{\RR}{\mathbb{R}}
      \newcommand\abs[1]{\left|#1\right|}
      \newcommand{\opt}[2][x]{#1 #2}
      \renewcommand*{\vec}[1]{\boldsymbol{#1}}
      \def\eps{\varepsilon}
    `);
    expect(macros["\\RR"]).toBe("\\mathbb{R}");
    expect(macros["\\abs"]).toBe("\\left|#1\\right|");
    expect(macros["\\vec"]).toBe("\\boldsymbol{#1}");
    expect(macros["\\eps"]).toBe("\\varepsilon");
    expect(macros["\\opt"]).toBeUndefined();
  });

  it("renders nested and described lists with labels", () => {
    const result = renderLatexLive(String.raw`
      \begin{document}
      \begin{itemize}
      \item A
      \begin{enumerate}
      \item B
      \end{enumerate}
      \item C
      \end{itemize}
      \begin{description}
      \item[Begriff] Erklärung
      \end{description}
      \end{document}
    `);

    expect(result.html).toContain("<ul>\n<li>A\n<ol>\n<li>B</li>\n</ol>\n</li>\n<li>C</li>\n</ul>");
    expect(result.html).toContain("<dl>\n<dt>Begriff</dt><dd>Erklärung</dd>\n</dl>");
    expect(result.warnings).toEqual([]);
  });

  it("treats line breaks with spacing, accents and quotes like LaTeX", () => {
    const result = renderLatexLive(String.raw`
      \begin{document}
      Zeile eins\\[2mm]
      Gr\"une \"{A}pfel, \ss{} und ${"``"}Zitat'' sowie \enquote{Anführung}.
      \vspace{1cm}
      \section{Titel} Text danach
      \end{document}
    `);

    expect(result.html).toContain("Zeile eins<br>");
    expect(result.html).not.toContain("[2mm]");
    expect(result.html).toContain("Grüne Äpfel, ß und “Zitat” sowie „Anführung“.");
    expect(result.html).not.toContain("1cm");
    expect(result.html).toContain("</h2>\n<p>Text danach</p>");
    expect(result.warnings).toEqual([]);
  });

  it("renders tables with header rows, alignment and multicolumn cells", () => {
    const result = renderLatexLive(String.raw`
      \begin{document}
      \begin{tabular}{|l|c|r|}
      \toprule
      Name & Wert & Einheit \\
      \midrule
      \multicolumn{2}{c}{zusammen} & kg \\
      A & 1 & m \\
      \bottomrule
      \end{tabular}
      \end{document}
    `);

    expect(result.html).toContain('<thead><tr><th style="text-align: left">Name</th>');
    expect(result.html).toContain('<td colspan="2" style="text-align: center">zusammen</td>');
    expect(result.html).toContain('<td style="text-align: right">m</td>');
    expect(result.html).not.toContain("toprule");
    expect(parseColumnAlignments("|l|*{2}{c}|p{3cm}r|")).toEqual([
      "left",
      "center",
      "center",
      "left",
      "right",
    ]);
  });

  it("collects footnotes, numbers headings and renders theorem environments", () => {
    const result = renderLatexLive(String.raw`
      \usepackage[english]{babel}
      \begin{document}
      \tableofcontents
      \section{Intro}
      Text\footnote{Eine Fußnote} weiter.
      \subsection*{Unnumbered}
      \subsection{Sub}
      \begin{theorem}[Euler]
      $e^{i\pi} + 1 = 0$
      \end{theorem}
      \begin{proof}
      Trivial.
      \end{proof}
      \end{document}
    `);

    expect(result.html).toContain('<sup class="latex-footnote" title="Footnote 1">1</sup>');
    expect(result.html).toContain('<section class="latex-footnotes" aria-label="Footnotes"><ol><li id="latex-footnote-1">Eine Fußnote</li></ol></section>');
    expect(result.html).toContain('<span class="latex-number">1.1</span> Sub</h3>');
    expect(result.html).toContain('<h3 class="latex-heading latex-subsection">Unnumbered</h3>');
    expect(result.html).toContain('<nav class="latex-toc"><h2 class="latex-toc-title">Contents</h2>');
    expect(result.html).toContain('<strong class="latex-theorem-title">Theorem (Euler).</strong>');
    expect(result.html).toContain('<em class="latex-theorem-title">Proof.</em>');
    expect(result.html).toContain('<span class="latex-qed">∎</span>');
  });

  it("detects the babel document language", () => {
    expect(detectLanguage(String.raw`\usepackage[ngerman]{babel}`)).toBe("de");
    expect(detectLanguage(String.raw`\usepackage[german,english]{babel}`)).toBe("en");
    expect(detectLanguage(String.raw`\usepackage[english,main=ngerman]{babel}`)).toBe("de");
    expect(detectLanguage(String.raw`\setmainlanguage{english}`)).toBe("en");
    expect(detectLanguage("")).toBe("de");
  });

  it("renders siunitx quantities and colored text safely", () => {
    const result = renderLatexLive(String.raw`
      \begin{document}
      \SI{10}{\kilo\meter\per\hour} und \textcolor{red}{rot} sowie \textcolor{x;background:url(1)}{sicher}.
      \end{document}
    `);

    expect(result.html).toContain("10\u2009km/h");
    expect(result.html).toContain('<span class="latex-textcolor" style="color: red">rot</span>');
    expect(result.html).toContain("sicher");
    expect(result.html).not.toContain("url(1)");
  });
});
