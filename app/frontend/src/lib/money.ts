import type { Kopecks } from '../types';

const fmt = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 45500 -> "455,00 ₽" */
export function formatMoney(kop: Kopecks, opts?: { sign?: boolean }): string {
  const rub = kop / 100;
  const s = fmt.format(Math.abs(rub));
  if (opts?.sign && kop > 0) return `+${s}`;
  if (kop < 0) return `−${s}`;
  return s;
}

/** 45500 -> "455" (для numpad) */
export function kopecksToInput(kop: Kopecks): string {
  return (kop / 100).toFixed(2).replace('.', ',');
}

/** "455,50" -> 45550 kop; возвращает null при мусоре */
export function inputToKopecks(raw: string): Kopecks | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

/** "455,50" / "455.50" / "455" -> копейки; null при мусоре */
export function rublesToKopecks(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const kop = Math.round(parseFloat(cleaned) * 100);
  return Number.isSafeInteger(kop) && kop >= 0 ? kop : null;
}

export function parseRublesInput(raw: string): Kopecks {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 0;
  // храним ввод как копейки напрямую: "1234" -> 12,34 ₽
  return parseInt(digits, 10);
}

export function kopInputToKopecks(kopInput: number): Kopecks {
  return kopInput;
}
