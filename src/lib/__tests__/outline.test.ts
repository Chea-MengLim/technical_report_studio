import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DocNode } from "@/lib/doc";
import { collectLabels, parseSectionsFile, type ImportContext } from "@/lib/import/latex-to-doc";
import { collectRefKinds, serializeDoc } from "@/lib/latex/serialize";
import { docToOutline, headingNumbers, newItemLike, outlineToDoc } from "../outline";

const root = path.join(process.cwd(), "templates", "sqlyst", "sections");
const files = fs.readdirSync(root).filter((f) => f.endsWith(".tex")).sort();
const src = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

function latex(doc: DocNode) {
  return serializeDoc(
    { slug: "t", assetPath: (id) => `a/${id}.png`, refKinds: collectRefKinds([doc]), warnings: [], usedLabels: new Set() },
    doc,
  );
}

const ctx: ImportContext = { projectName: "Demo", labels: new Map(), resolveImage: (f) => f, warnings: [] };
collectLabels(files.map(src).join("\n"), ctx.labels);
const sections = files.flatMap((f) => parseSectionsFile(src(f), ctx)).filter((s) => s.title);

describe("section outline", () => {
  it.each(sections.map((s) => [s.title, s.content] as const))("%s prints the same after the form view", (_, doc) => {
    expect(latex(outlineToDoc(docToOutline(doc)))).toBe(latex(doc));
  });

  it("gives each technology its own heading, description and 'Why we chose it' box", () => {
    const related = sections.find((s) => s.title === "RELATED TECHNOLOGIES")!;
    const o = docToOutline(related.content);
    const python = o.items.find((i) => i.title === "Python")!;
    expect(python.level).toBe(3);
    expect(python.segments.map((s) => s.label)).toEqual([null, "Why we chose it."]);
    expect(headingNumbers(o.items, 2).slice(0, 2)).toEqual(["2.1", "2.1.1"]);
  });

  it("adds a new item with the same boxes, empty", () => {
    const related = sections.find((s) => s.title === "RELATED TECHNOLOGIES")!;
    const o = docToOutline(related.content);
    const python = o.items.find((i) => i.title === "Python")!;
    const added = newItemLike(python, 3);
    expect(added.segments.map((s) => s.label)).toEqual([null, "Why we chose it."]);
    expect(added.title).toBe("");
  });
});
