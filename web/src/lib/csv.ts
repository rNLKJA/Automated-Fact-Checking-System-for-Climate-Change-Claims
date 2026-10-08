/**
 * RFC 4180 CSV for the exports (AI audit log, evaluation results).
 *
 * Objects are written as JSON. Text that a spreadsheet would run as a formula
 * (starting with =, +, -, @, tab or carriage return) is prefixed with an
 * apostrophe, because model output is untrusted text.
 */

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly (keyof T & string)[],
): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}
