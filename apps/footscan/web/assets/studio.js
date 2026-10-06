// Small helpers shared by studio pages.
export const STATUS = {
  uploading: { label: "Unfinished", cls: "" },
  received: { label: "New", cls: "brand" },
  needs_rescan: { label: "Waiting for rescan", cls: "warn" },
  archived: { label: "Archived", cls: "" },
};

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
