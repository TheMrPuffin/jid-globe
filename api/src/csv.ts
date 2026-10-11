// Turns pins into a CSV file that opens cleanly in Excel or Google Sheets.
import type { Pin } from './pins.js';

const COLUMNS: (keyof Pin)[] = ['id', 'jid', 'lat', 'lng', 'placement', 'city', 'note', 'added_by', 'created_at'];

// `added_by` holds the station label (?station=... in the address). An entry saved without
// one is written as "Unknown", the same word the web pages use (see web/src/station.ts).
const NO_STATION = 'Unknown';

export function pinsToCsv(pins: Pin[]): string {
  const rows = pins.map((pin) =>
    COLUMNS.map((column) => cell(column === 'added_by' ? (pin.added_by ?? NO_STATION) : pin[column])).join(','),
  );
  // The leading BOM tells Excel the file is UTF-8, so accented city names survive.
  return '﻿' + [COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

function cell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  // Spreadsheets treat text starting with = + - @ as a formula; a leading ' disarms it.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
