import { describe, expect, it } from "vitest";
import { renderLatexLive } from "./latex";

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
    expect(result.html).toContain("<h2>Einführung</h2>");
    expect(result.html).toContain("<strong>wichtiger</strong>");
    expect(result.html).toContain("<ul>");
    expect(result.html).toContain("<li>Erster Punkt</li>");
    expect(result.html).toContain("class=\"katex\"");
    expect(result.html).toContain("class=\"katex-display\"");
    expect(result.truncated).toBe(false);
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
      \end{document}
    `);

    expect(result.html).toContain("class=\"latex-code\"");
    expect(result.html).toContain("&lt;unsafe&gt;% remains literal");
  });

  it("bounds pathological math input", () => {
    const result = renderLatexLive(`$${"x".repeat(50_001)}$`);
    expect(result.warnings).toContain(
      "Eine Formel überschreitet das Live-Limit von 50.000 Zeichen.",
    );
    expect(result.html).toContain("latex-math-error");
  });

  it("uses simple bundled KaTeX macros from the preamble", () => {
    const result = renderLatexLive(String.raw`
      \newcommand{\R}{\mathbb{R}}
      \begin{document}
      $x \in \R$
      \end{document}
    `);

    expect(result.html).toContain("mathbb");
    expect(result.html).not.toContain("katex-error");
  });
});
