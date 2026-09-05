/**
 * CSV writing for the export buttons.
 *
 * Every field is quoted whether it needs it or not: names and positions are
 * free text, and one comma in "Dela Cruz, Jr." used to shift every column after
 * it by one. Quotes inside a field are doubled and rows end with CRLF, per
 * RFC 4180.
 */

/** Byte-order mark. Without it a spreadsheet reads `₱` and the ñ in a Filipino
 *  name as Latin-1, so "₱" arrives as "â‚±". */
const BOM = '﻿';

/**
 * A leading `=`, `+` or `@` is prefixed with a tab, because a spreadsheet reads
 * those as the start of a formula and would evaluate a name like `=cmd|…` on
 * open. A leading `-` is left alone: in these exports it is a negative figure.
 */
export const csvCell = (value) => {
  const text = String(value ?? '');
  const guarded = /^[=+@]/.test(text) ? `\t${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
};

export const toCsv = (headers, rows) =>
  [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

/** Hands the webview a Blob URL and clicks it. */
export const downloadCsv = (filename, csv) => {
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on a later task, not in this one. The download reads the blob
  // asynchronously, so revoking in the same tick as the click is a race the
  // download can lose — and it loses silently, with no error and no file.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};
