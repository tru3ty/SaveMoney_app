import type { BudgetData, Period } from '../types';
import type { DashboardCalc } from '../lib/budget';

export type BudgetOverview = Omit<DashboardCalc, 'horizon'>;

export interface Snapshot extends Omit<BudgetData, 'closures'> {
  schemaVersion: 1;
  periodClosures: BudgetData['closures'];
  settings: Record<string, unknown>;
}

export class BudgetApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<Snapshot>;
  return snapshot.schemaVersion === 1
    && !!snapshot.settings && typeof snapshot.settings === 'object'
    && [
      snapshot.categories, snapshot.incomeSources, snapshot.obligations,
      snapshot.periods, snapshot.envelopes, snapshot.periodClosures,
      snapshot.transactions, snapshot.goals,
    ].every(Array.isArray);
}

export const calendarPeriodId = (period: Period) => period.startDate.slice(0, 7);
export const escapeId = encodeURIComponent;

export function toBudgetData(snapshot: Snapshot): BudgetData {
  // Интерфейс сортирует календарные месяцы, а импортированные ID сервера могут быть непрозрачными.
  const periodIds = new Map(snapshot.periods.map((period) => [period.id, calendarPeriodId(period)]));
  const periodId = (id: string) => periodIds.get(id) ?? id;
  return {
    categories: snapshot.categories,
    incomeSources: snapshot.incomeSources,
    obligations: snapshot.obligations,
    goals: snapshot.goals,
    closures: snapshot.periodClosures,
    periods: snapshot.periods.map((period) => ({ ...period, id: periodId(period.id) })),
    envelopes: snapshot.envelopes.map((envelope) => ({ ...envelope, periodId: periodId(envelope.periodId) })),
    transactions: snapshot.transactions.map((transaction) => ({ ...transaction, periodId: periodId(transaction.periodId) })),
  };
}

type WriteMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export function createBudgetApi(transport: typeof fetch = fetch) {
  async function request(path: string, options: RequestInit) {
    let response: Response;
    try {
      response = await transport('/api/v1' + path, {
        ...options,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...options.headers,
        },
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new BudgetApiError(0, 'Не удалось подключиться к серверу');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = body?.error?.message;
      throw new BudgetApiError(response.status, typeof message === 'string' ? message : `Ошибка сервера (${response.status})`);
    }
    return response;
  }

  return {
    async load(signal?: AbortSignal): Promise<Snapshot> {
      const response = await request('/snapshots/current', { signal });
      const body: unknown = await response.json().catch(() => null);
      if (!isSnapshot(body)) throw new BudgetApiError(response.status, 'Сервер вернул некорректный ответ');
      return body;
    },
    async overview(date: string, signal?: AbortSignal): Promise<BudgetOverview> {
      const response = await request(`/dashboard?date=${encodeURIComponent(date)}`, { signal });
      const body = await response.json().catch(() => null);
      const overview = body?.data;
      if (!overview || ![overview.balance, overview.reserved, overview.available, overview.daysLeft, overview.dailyLimit].every(Number.isFinite)
          || (overview.nextIncomeDate !== null && typeof overview.nextIncomeDate !== 'string')) {
        throw new BudgetApiError(response.status, 'Сервер вернул некорректный баланс');
      }
      return overview;
    },
    async write(method: WriteMethod, path: string, body?: unknown): Promise<void> {
      await request(path, body === undefined ? { method } : {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  };
}
