import { describe, expect, it } from "vitest";
import type { DocNode } from "@/lib/doc";
import { escapeText, sanitizeCode, escapeCaption } from "../escape";
import { collectRefKinds, serializeDoc, type SerializeContext } from "../serialize";
import { profileRows } from "../document";

function ctxFor(doc: DocNode): SerializeContext {
  return {
    slug: "demo",
    assetPath: (id) => (id === "img1" ? "projects/demo/assets/img1.png" : null),
    refKinds: collectRefKinds([doc]),
    warnings: [],
    usedLabels: new Set(),
  };
}
const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content });
const p = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const t = (text: string, marks?: DocNode["marks"]): DocNode => ({ type: "text", text, ...(marks ? { marks } : {}) });

describe("escapeText", () => {
  it("escapes LaTeX special characters", () => {
    expect(escapeText("50% of $10 & #1_a {x} ~ ^ \\")).toBe(
      "50\\% of \\$10 \\& \\#1\\_a \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}",
    );
  });
  it("converts quotes and dashes", () => {
    expect(escapeText('He said "hi" \u2013 it\'s \u201cfine\u201d\u2014ok')).toBe(
      "He said ``hi'' -- it's ``fine''---ok",
    );
  });
  it("replaces characters pdfLaTeX cannot print", () => {
    const bad: string[] = [];
    expect(escapeText("\ud55c\uae00 ok", { onUnsupported: (c) => bad.push(c) })).toBe("?? ok");
    expect(bad).toHaveLength(2);
  });
  it("keeps accented Latin letters", () => {
    expect(escapeText("café naïve")).toBe("café naïve");
  });
});

describe("captions and code", () => {
  it("turns `backticks` into \\code", () => {
    expect(escapeCaption("Service (`text2sql_service.py`)")).toBe("Service (\\code{text2sql\\_service.py})");
  });
  it("sanitizes listings", () => {
    expect(sanitizeCode("print(\u201chi\u201d)\t# \ud55c")).toBe('print("hi")    # ?');
    expect(sanitizeCode("x = '\\end{lstlisting}'")).toBe("x = '\\end {lstlisting}'");
  });
});

describe("serializeDoc", () => {
  it("writes marks, links and the project name", () => {
    const d = doc(
      p(
        { type: "projectName", attrs: { name: "Demo" } },
        t("'s "),
        t("bold", [{ type: "bold" }]),
        t(" "),
        t("it", [{ type: "italic" }]),
        t(" "),
        t("f(x)", [{ type: "code" }]),
        t(" "),
        t("site", [{ type: "link", attrs: { href: "https://a.b/c?x=1#y" } }]),
      ),
    );
    expect(serializeDoc(ctxFor(d), d).trim()).toBe(
      "\\projname{}'s \\textbf{bold} \\textit{it} \\code{f(x)} \\href{https://a.b/c?x=1\\#y}{site}",
    );
  });

  it("writes headings and lists", () => {
    const d = doc(
      p(t("intro")),
      { type: "heading", attrs: { level: 2 }, content: [t("Scope & Aim")] },
      { type: "heading", attrs: { level: 3, numbered: false }, content: [t("1. Detail")] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [p(t("Label:", [{ type: "bold" }]), t(" text"))] },
          { type: "listItem", content: [p(t("second"))] },
        ],
      },
    );
    const out = serializeDoc(ctxFor(d), d);
    expect(out).toContain("\\subsection{Scope \\& Aim}");
    expect(out).toContain("\\subsubsection*{1. Detail}");
    expect(out).toContain("\\begin{itemize}\n  \\item \\textbf{Label:} text\n  \\item second\n\\end{itemize}");
  });

  it("writes figures with prefixed labels and resolves cross-references", () => {
    const d = doc(
      p(t("See "), { type: "crossRef", attrs: { refId: "arch" } }, t(".")),
      { type: "figure", attrs: { assetId: "img1", caption: "The architecture", width: "XL", refId: "arch" } },
    );
    const out = serializeDoc(ctxFor(d), d);
    expect(out).toContain("See Figure~\\ref{demo:fig:arch}.");
    expect(out).toContain(
      "\\projfigure{0.95}{projects/demo/assets/img1.png}{The architecture}{demo:fig:arch}",
    );
  });

  it("reports a figure without an image and a dangling reference", () => {
    const d = doc(
      p({ type: "crossRef", attrs: { refId: "gone" } }),
      { type: "figure", attrs: { assetId: "missing", caption: "x", refId: "f" } },
    );
    const ctx = ctxFor(d);
    const out = serializeDoc(ctx, d);
    expect(out).toContain("??");
    expect(out).not.toContain("projfigure");
    expect(ctx.warnings).toHaveLength(2);
  });

  it("writes tables with header colour, zebra rows and column types", () => {
    const cell = (type: string, text: string): DocNode => ({ type, content: [p(t(text))] });
    const d = doc({
      type: "table",
      attrs: {
        caption: "Scope",
        refId: "scope",
        columns: [
          { align: "left", width: 4.2 },
          { align: "center", width: null },
        ],
      },
      content: [
        { type: "tableRow", content: [cell("tableHeader", "Function"), cell("tableHeader", "Description")] },
        { type: "tableRow", content: [cell("tableCell", "A"), cell("tableCell", "first")] },
        { type: "tableRow", content: [cell("tableCell", "B"), cell("tableCell", "second")] },
        { type: "tableRow", content: [cell("tableCell", "C"), cell("tableCell", "third")] },
      ],
    });
    const out = serializeDoc(ctxFor(d), d);
    expect(out).toContain("\\begin{tabularx}{\\linewidth}{L{4.2cm} Z}");
    expect(out).toContain("\\caption{Scope}\n\\label{demo:tab:scope}");
    expect(out).toContain(
      "\\rowcolor{HeaderGray}\n\\textcolor{white}{\\textbf{Function}} & \\textcolor{white}{\\textbf{Description}} \\\\",
    );
    expect(out).toContain("A & first \\\\\n\\rowcolor{RowGray}\nB & second \\\\\nC & third \\\\");
  });

  it("writes code listings with language, caption and label", () => {
    const d = doc({
      type: "codeBlock",
      attrs: { language: "sql", caption: "Query", refId: "q" },
      content: [t("SELECT 1;\n")],
    });
    expect(serializeDoc(ctxFor(d), d)).toBe(
      "\\begin{lstlisting}[style=highlight, language=SQL, caption={Query}, label={demo:lst:q}]\nSELECT 1;\n\\end{lstlisting}\n\n",
    );
  });

  it("gives pasted duplicates no second label", () => {
    const fig = { type: "figure", attrs: { assetId: "img1", caption: "x", refId: "same" } };
    const d = doc(fig, fig);
    const out = serializeDoc(ctxFor(d), d);
    expect(out.match(/\\label|demo:fig:same/g)).toHaveLength(1);
  });

  it("writes page breaks", () => {
    const d = doc(p(t("a")), { type: "pageBreak" }, p(t("b")));
    expect(serializeDoc(ctxFor(d), d)).toBe("a\n\n\\clearpage\n\nb\n\n");
  });
});

describe("profileRows", () => {
  it("splits team members into rows of at most four, larger rows last", () => {
    const sizes = (n: number) => profileRows(Array.from({ length: n }, (_, i) => i)).map((r) => r.length);
    expect(sizes(7)).toEqual([3, 4]);
    expect(sizes(4)).toEqual([4]);
    expect(sizes(5)).toEqual([2, 3]);
    expect(sizes(9)).toEqual([3, 3, 3]);
    expect(sizes(0)).toEqual([]);
  });
});
