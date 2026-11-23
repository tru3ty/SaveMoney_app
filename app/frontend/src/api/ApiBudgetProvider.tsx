import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BudgetContext, ToastContext, useBudgetToasts,
  type BudgetContextValue,
} from '../budget-context';
import { TODAY } from '../lib/mode';
import { planClosures } from './closures';
import { calendarPeriodId, createBudgetApi, escapeId, toBudgetData, type Snapshot } from './budget';

const api = createBudgetApi();
type BudgetState = Awaited<ReturnType<typeof loadBudget>>;

async function loadBudget(signal?: AbortSignal) {
  const [snapshot, overview] = await Promise.all([
    api.load(signal), api.overview(TODAY, signal),
  ]);
  return { snapshot, overview };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Ошибка запроса к серверу';
}

function periodPath(snapshot: Snapshot, periodId?: string) {
  const period = snapshot.periods.find((item) =>
    periodId ? calendarPeriodId(item) === periodId : item.status === 'active');
  if (!period) throw new Error('Сначала откройте период');
  return `/periods/${escapeId(period.id)}`;
}

function writeResource<T extends object>(resource: string, input: T & { id?: string }, id?: string) {
  const { id: _id, ...payload } = input;
  return id === undefined
    ? api.write('POST', resource, payload)
    : api.write('PATCH', `${resource}/${escapeId(id)}`, payload);
}

function requireTransactionPeriod(snapshot: Snapshot, date: string) {
  if (!snapshot.periods.some((period) => calendarPeriodId(period) === date.slice(0, 7))) {
    throw new Error('Для даты операции ещё не открыт период');
  }
}

export function ApiBudgetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BudgetState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, retry] = useState(0);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const toasts = useBudgetToasts();

  useEffect(() => {
    const controller = new AbortController();
    void loadBudget(controller.signal).then(
      (loaded) => {
        if (!controller.signal.aborted) setState(loaded);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setLoadError(message(error));
      },
    );
    return () => controller.abort();
  }, [attempt]);

  if (!state || loadError) {
    return (
      <main className="app-shell items-center justify-center p-6 text-center" aria-busy={!loadError}>
        <p role={loadError ? 'alert' : 'status'}>{loadError || 'Загрузка бюджета…'}</p>
        {loadError && (
          <button
            type="button"
            className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white"
            onClick={() => { setLoadError(''); setState(null); retry((value) => value + 1); }}
          >
            Повторить
          </button>
        )}
      </main>
    );
  }

  const { snapshot, overview } = state;
  const data = toBudgetData(snapshot);
  async function mutate(action: () => Promise<void>, success: string): Promise<boolean> {
    if (writing.current) return false;
    writing.current = true;
    setBusy(true);
    let committed = false;
    try {
      try {
        await action();
        committed = true;
      } catch (error) {
        toasts.push(message(error));
      }

      try {
        setState(await loadBudget());
      } catch {
        setLoadError(committed
          ? 'Изменения сохранены. Обновите бюджет, чтобы увидеть их.'
          : 'Проверьте связь с сервером и обновите бюджет перед повторной отправкой.');
        return committed;
      }
      if (committed) toasts.push(success, 'success');
      return committed;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  const value: BudgetContextValue = {
    data,
    overview,
    busy,
    addTransaction: (input) => mutate(async () => {
      requireTransactionPeriod(snapshot, input.date);
      await api.write('POST', '/transactions', input);
    }, 'Операция добавлена'),
    updateTransaction: (id, { type: _type, ...input }) => mutate(async () => {
      requireTransactionPeriod(snapshot, input.date);
      await api.write('PATCH', `/transactions/${escapeId(id)}`, input);
    }, 'Операция обновлена'),
    deleteTransaction: (id) => mutate(
      () => api.write('DELETE', `/transactions/${escapeId(id)}`), 'Операция удалена'),
    restoreTransaction: (id) => mutate(
      () => api.write('PATCH', `/transactions/${escapeId(id)}`, { deletedAt: null }), 'Операция восстановлена'),
    createCategory: (input) => mutate(() => writeResource('/categories', input), 'Категория создана'),
    updateCategory: (id, input) => mutate(() => writeResource('/categories', input, id), 'Категория обновлена'),
    deleteCategory: (id) => mutate(() => writeResource('/categories', { isArchived: true }, id), 'Категория в архиве'),
    upsertIncomeSource: (input, id) => mutate(() => writeResource('/income-sources', input, id), 'Источник сохранён'),
    deleteIncomeSource: (id) => mutate(() => writeResource('/income-sources', { isActive: false }, id), 'Источник отключён'),
    upsertObligation: (input, id) => mutate(() => writeResource('/obligations', input, id), 'Обязательство сохранено'),
    deleteObligation: (id) => mutate(() => writeResource('/obligations', { isActive: false }, id), 'Обязательство отключено'),
    upsertGoal: (input, id) => mutate(() => writeResource('/goals', input, id), 'Цель сохранена'),
    deleteGoal: (id) => mutate(() => writeResource('/goals', { status: 'archived' }, id), 'Цель в архиве'),
    setEnvelopeLimit: (categoryId, limitAmount, periodId) => mutate(
      () => api.write('PUT', `${periodPath(snapshot, periodId)}/envelopes/${escapeId(categoryId)}`, { limitAmount }),
      'Лимит сохранён',
    ),
    createPeriodsUpTo: (date) => mutate(() => api.write('POST', '/periods', { date }), 'Период открыт'),
    applyClosures: (draft) => mutate(async () => {
      const { periodId, decisions } = planClosures(data, draft);
      const path = `${periodPath(snapshot, periodId)}/closures`;
      let saved = 0;
      try {
        for (const decision of decisions) {
          await api.write('POST', path, decision);
          saved += 1;
        }
      } catch (error) {
        if (!saved) throw error;
        throw new Error(`Сохранено решений: ${saved} из ${decisions.length}. ${message(error)}`);
      }
    }, 'Решения сохранены'),
    exportSnapshot: () => JSON.stringify(snapshot, null, 2),
    importSnapshot: (json) => mutate(async () => {
      let parsed: unknown;
      try { parsed = JSON.parse(json); } catch { throw new Error('Невалидный JSON'); }
      await api.write('PUT', '/snapshots/current', parsed);
    }, 'Снимок импортирован'),
    resetData: () => mutate(() => api.write('DELETE', '/budget'), 'Бюджет очищен'),
  };

  return (
    <BudgetContext.Provider value={value}>
      <ToastContext.Provider value={toasts}>{children}</ToastContext.Provider>
    </BudgetContext.Provider>
  );
}
