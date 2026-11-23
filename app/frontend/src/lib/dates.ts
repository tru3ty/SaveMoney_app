/** "2026-11-23" -> Date (UTC-полночь, календарная дата без TZ) */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

export function diffDays(a: string, b: string): number {
  return Math.round(
    (parseDate(b).getTime() - parseDate(a).getTime()) / 86400000,
  );
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

export function formatDate(s: string): string {
  const d = parseDate(s);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatDateShort(s: string): string {
  const d = parseDate(s);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(periodId: string): string {
  const [y, m] = periodId.split('-').map(Number);
  const name = MONTHS[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

export function isWeekend(s: string): boolean {
  const day = parseDate(s).getUTCDay();
  return day === 0 || day === 6;
}

export function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** следующий день месяца с клампом 31 -> последний день короткого месяца */
export function monthlyDate(
  year: number,
  month: number,
  dayOfMonth: number,
): Date {
  const day = Math.min(dayOfMonth, lastDayOfMonth(year, month));
  return new Date(Date.UTC(year, month - 1, day));
}

/** ближайшая дата >= from для графика monthly_day / monthly_last_day */
export function nextScheduleDate(
  schedule: 'monthly_day' | 'monthly_last_day',
  dayOfMonth: number | null,
  fromISO: string,
): Date | null {
  const from = parseDate(fromISO);
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + 1;
  for (let i = 0; i < 14; i++) {
    const mm = m + i;
    const year = y + Math.floor((mm - 1) / 12);
    const month = ((mm - 1) % 12) + 1;
    const day =
      schedule === 'monthly_last_day'
        ? lastDayOfMonth(year, month)
        : Math.min(dayOfMonth ?? 1, lastDayOfMonth(year, month));
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getTime() >= from.getTime()) return d;
  }
  return null;
}

export function weekdayShort(s: string): string {
  const names = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  return names[parseDate(s).getUTCDay()];
}
