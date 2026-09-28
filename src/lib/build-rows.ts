/** Builds as sent to the browser. */
export interface BuildRow {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED";
  pages: number | null;
  createdAt: string;
  log: string | null;
  hasPdf: boolean;
  hasZip: boolean;
}

export function toBuildRows(
  rows: {
    id: string;
    status: BuildRow["status"];
    pages: number | null;
    createdAt: Date;
    log: string | null;
    pdfKey: string | null;
    zipKey: string | null;
  }[],
): BuildRow[] {
  return rows.map((b) => ({
    id: b.id,
    status: b.status,
    pages: b.pages,
    createdAt: b.createdAt.toISOString(),
    log: b.log,
    hasPdf: !!b.pdfKey,
    hasZip: !!b.zipKey,
  }));
}
