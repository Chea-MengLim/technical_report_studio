# KSHRD Book Studio

A web app where each project team writes its report in a rich-text editor,
and the admin merges all project reports into one typeset book (PDF and
LaTeX source).

Team members control the **content**: text, subsections, lists, tables,
figures, code listings and references. The **format** comes from the LaTeX
templates in `latex/templates/`, copied from the SQLyst Overleaf project.
The editor has no controls for fonts, sizes or colours.

## Stack

| Part | Technology |
| --- | --- |
| Web app and backend | Next.js 16 (App Router, Server Actions, Route Handlers) |
| Database | PostgreSQL 16 via Drizzle ORM (`src/db/schema.ts`, migrations in `drizzle/`) |
| Images, PDFs, zips | RustFS (S3-compatible), bucket `book-assets` |
| Editor | Tiptap 3, restricted to the nodes in `src/components/editor/extensions.ts` |
| Typesetting | TeX Live (`latexmk -pdf`), in Docker |

## Running it (development)

Prerequisites: Node 22 and Docker Desktop.

```bash
cp .env.example .env              # then set SESSION_SECRET, S3_ACCESS_KEY, S3_SECRET_KEY
docker compose up -d              # postgres on :5433, RustFS on :9000 (console :9001)
npm install
npm run db:migrate                # tables + first admin (ADMIN_EMAIL / ADMIN_PASSWORD)
npm run import:sqlyst             # optional: imports ../SQLyst_Report_Overleaf
npm run dev                       # http://localhost:3000
```

On a machine without TeX installed, set `LATEX_RUNNER=docker` in `.env`.
Each build then runs `latexmk` inside `texlive/texlive:latest`.

`import:sqlyst` also creates the editor account `sqlyst@kshrd.local` /
`sqlyst12345`, a member of the SQLyst project.

## Production

```bash
docker compose --profile app up -d --build
```

The `app` image is built on `texlive/texlive` with Node added, so it compiles
LaTeX itself (`LATEX_RUNNER=local`). On start-up the app applies migrations
and creates the first admin (see `src/instrumentation.ts`).

`S3_PUBLIC_ENDPOINT` must be an address the users' browsers can reach. Images
and PDFs are served through short-lived signed RustFS URLs. Set
`COOKIE_SECURE=true` when the app is served over HTTPS.

## How the book is put together

- **Project.** One team's report, laid out like the original SQLyst report:
  1. Cover
  2. Team profile page
  3. Front sections (contributors, acknowledgement, executive summary …)
  4. Contents
  5. Chapters I, II, …
  6. References
  7. Appendices
- **Sections.** Freely added, renamed, reordered and deleted in the sidebar.
  A section is front matter, a chapter or an appendix. Subsections are
  headings inside the editor.
- **Cover, profile page and contributors list.** Generated from structured
  fields: *Cover page* and *Team members*.
- **Book** (admin → *Book*):
  1. Book cover
  2. Preface
  3. One contents page
  4. Every included project, in the chosen order. Each project starts with
     its own cover.
- **Numbering in the book.** Section, figure, table and listing numbers
  restart for every project.
- **Labels and image paths.** Prefixed with the project's short id, so two
  projects can use the same image names and captions without clashing.

Workflow: editors write and build a preview PDF, then click *Submit for
review*. The admin approves the project, or returns it with feedback. By
default the book includes only approved projects.

Editing: only one person can edit a section at a time. The lock is renewed
every 30 s and released when the tab closes. Everyone else sees the section
read-only. Changes are autosaved, and *History* keeps a version for every
10 minutes of editing.

## Code map

| Path | What |
| --- | --- |
| `src/lib/doc.ts` | The document model shared by editor, serializer and importer |
| `src/lib/latex/serialize.ts` | Editor JSON → LaTeX (escaping, tables, figures, listings, references) |
| `src/lib/latex/document.ts` | Complete sources for a project or the book (cover, profile, `main.tex`) |
| `src/lib/latex/build.ts` | Writes sources, downloads images from RustFS, runs latexmk, uploads PDF/zip |
| `latex/templates/` | `packages.tex`, `style.tex`, `listings.tex` (from the Overleaf project), `commands.tex` |
| `src/lib/import/latex-to-doc.ts` | LaTeX → editor JSON, for the SQLyst import |
| `src/components/editor/` | Tiptap editor, toolbar, table panel and block views |
| `src/app/actions/` | Server actions (sections/locking, projects, admin) |

## Scripts

| Command | |
| --- | --- |
| `npm test` | Unit tests for the LaTeX serializer |
| `npm run test:e2e` | Playwright tests (needs the imported SQLyst project and a running dev server) |
| `npm run pdf -- sqlyst --out sqlyst.pdf` | Build one project from the command line |
| `npm run pdf -- --book --out book.pdf` | Build the book from the command line |
| `npm run db:generate` | New migration after changing `src/db/schema.ts` |

## Limitations

- pdfLaTeX cannot print Hangul, Khmer or emoji in the text. The editor warns
  about them, and they are replaced by `?` in the PDF.
- Table cells hold text only (no merged cells, lists or images).
- Citations are printed as a reference list. There is no inline `\cite`.
