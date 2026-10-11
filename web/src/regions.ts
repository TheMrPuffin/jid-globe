// The seven WOSM regions a JID can start with, and the pin colour for each.
export interface Region {
  digit: string;
  name: string;
  color: string;
}

export const REGIONS: Region[] = [
  { digit: '1', name: 'Africa', color: '#f5b301' },
  { digit: '2', name: 'Arab', color: '#34d399' },
  { digit: '3', name: 'Asia-Pacific', color: '#f43f5e' },
  { digit: '4', name: 'Eurasia', color: '#a78bfa' },
  { digit: '5', name: 'European', color: '#38bdf8' },
  { digit: '6', name: 'Interamerican', color: '#fb923c' },
  { digit: '7', name: 'Special', color: '#f472b6' },
];

export function regionFor(digit: string): Region | undefined {
  return REGIONS.find((region) => region.digit === digit);
}

export function regionColor(digit: string): string {
  return regionFor(digit)?.color ?? '#ffffff';
}
