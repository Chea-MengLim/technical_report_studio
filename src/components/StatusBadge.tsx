const STYLES = {
  DRAFT: ["bg-slate-100 text-slate-700", "Draft"],
  SUBMITTED: ["bg-amber-100 text-amber-800", "Submitted for review"],
  APPROVED: ["bg-emerald-100 text-emerald-800", "Approved"],
  RETURNED: ["bg-red-100 text-red-800", "Returned for changes"],
} as const;

export function StatusBadge({ status }: { status: keyof typeof STYLES }) {
  const [cls, label] = STYLES[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
