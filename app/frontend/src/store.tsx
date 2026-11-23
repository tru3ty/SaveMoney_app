import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  BudgetData,
  Category,
  Envelope,
  Goal,
  IncomeSource,
  Obligation,
  Period,
  PeriodClosure,
  Transaction,
} from './types';
import { initialData } from './data/mock';
import { DEMO_STORAGE_KEY, loadDemoBudget, saveDemoBudget } from './data/demo-storage';
import {
  BudgetContext, ToastContext, useBudgetToasts,
  type BudgetContextValue, type ClosureDraft, type NewTransaction,
} from './budget-context';

export { useBudget, useToasts } from './budget-context';
import { activePeriod, pendingReviewPeriod, spentFor } from './lib/budget';
import {
  ValidationError,
  categoryArchivable,
  categoryDeletable,
  envelopeCategoryOk,
  goalUsedByTransactions,
  goalSeriesStaysPositive,
  nextSortOrder,
  pickColor,
  validateCategoryInput,
  validateClosureInput,
  validateEnvelopeLimit,
  validateGoalInput,
  validateIncomeSourceInput,
  validateObligationInput,
  validateTransactionInput,
  CATEGORY_COLORS,
} from './lib/validate';
import { lastDayOfMonth } from './lib/dates';

const newId = () => crypto.randomUUID();

type Plan = (data: BudgetData) => BudgetData;

function monthId(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}`;
}
function prevMonthId(pid: string) {
  const [y, m] = pid.split('-').map(Number);
  return m === 1 ? monthId(y - 1, 12) : monthId(y, m - 1);
}
function addMonthId(pid: string, n: number) {
  const [y, m] = pid.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return monthId(dt.getUTCFullYear(), dt.getUTCMonth() + 1);
}
function buildPeriod(pid: string): Period {
  const [y, m] = pid.split('-').map(Number);
  return {
    id: pid,
    year: y,
    month: m,
    startDate: `${pid}-01`,
    endDate: `${pid}-${String(lastDayOfMonth(y, m)).padStart(2, '0')}`,
    status: 'closed',
  };
}
function cloneEnvelopes(
  d: BudgetData,
  fromPid: string,
  toPid: string,
): Envelope[] {
  return d.categories
    .filter((c) => c.kind === 'expense' && c.parentId === null && !c.isArchived)
    .map((c) => {
      const prev = d.envelopes.find(
        (e) => e.periodId === fromPid && e.categoryId === c.id,
      );
      return {
        id: `${toPid}:${c.id}`,
        periodId: toPid,
        categoryId: c.id,
        limitAmount: prev?.limitAmount ?? 0,
        carryOverAmount: 0,
      };
    });
}

export function DemoBudgetProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(loadDemoBudget);
  const toasts = useBudgetToasts();
  const { push } = toasts;

  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key === null || event.key === DEMO_STORAGE_KEY) setData(loadDemoBudget());
    };
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, []);

  const run = useCallback(
    (plan: Plan, okMsg?: string) => {
      const commit = () => {
        let next: BudgetData;
        try {
          next = plan(loadDemoBudget());
        } catch (e) {
          push(e instanceof ValidationError ? e.message : 'Неожиданная ошибка');
          return false;
        }
        try {
          saveDemoBudget(undefined, next);
        } catch {
          push('Не удалось сохранить демобюджет в браузере');
          return false;
        }
        setData(next);
        if (okMsg) push(okMsg, 'success');
        return true;
      };
      // Вкладки на одном адресе записывают снимок по очереди.
      return navigator.locks
        ? navigator.locks.request(DEMO_STORAGE_KEY, commit).catch(() => {
            push('Не удалось получить доступ к демобюджету');
            return false;
          })
        : commit();
    },
    [push],
  );

  const ensurePeriod = useCallback(
    (d: BudgetData, date: string): BudgetData => {
      const pid = date.slice(0, 7);
      if (d.periods.some((p) => p.id === pid)) return d;
      const prev = prevMonthId(pid);
      const period = buildPeriod(pid);
      period.status = d.envelopes.some((e) => e.periodId === prev)
        ? 'pending_review'
        : 'closed';
      const periods = [...d.periods, period].sort((a, b) =>
        b.id.localeCompare(a.id),
      );
      return {
        ...d,
        periods,
        envelopes: [...d.envelopes, ...cloneEnvelopes(d, prev, pid)],
      };
    },
    [],
  );

  const addTransaction = useCallback(
    (t: NewTransaction) => {
      const id = newId();
      const createdAt = Date.now();
      return run((d) => {
        const base = ensurePeriod(d, t.date);
        const tx = buildTx(base, t, id, createdAt);
        return { ...base, transactions: [...base.transactions, tx] };
      }, 'Операция добавлена');
    },
    [run, ensurePeriod],
  );

  const updateTransaction = useCallback(
    (id: string, t: NewTransaction) => {
      return run((d) => {
        const idx = d.transactions.findIndex((x) => x.id === id);
        if (idx < 0) throw new ValidationError('Операция не найдена');
        const old = d.transactions[idx];
        if (old.deletedAt)
          throw new ValidationError('Операция удалена — восстановите её');
        const without = {
          ...d,
          transactions: d.transactions.filter((x) => x.id !== id),
        };
        const base = ensurePeriod(without, t.date);
        const tx = buildTx(base, t, id, old.createdAt);
        const transactions = [...base.transactions];
        transactions.splice(
          idx > transactions.length ? transactions.length : idx,
          0,
          tx,
        );
        // сохраняем сортировку: по дате убыв., затем id
        transactions.sort(
          (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
        );
        return { ...base, transactions };
      }, 'Операция обновлена');
    },
    [run, ensurePeriod],
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      return run((d) => {
        const tx = d.transactions.find((t) => t.id === id);
        if (!tx) throw new ValidationError('Операция не найдена');
        if (tx.deletedAt) throw new ValidationError('Операция уже удалена');
        const deleted: Transaction = { ...tx, deletedAt: Date.now() };
        const probe: BudgetData = {
          ...d,
          transactions: d.transactions.map((t) => (t.id === id ? deleted : t)),
        };
        if (tx.goalId && !goalSeriesStaysPositive(probe, tx.goalId)) {
          throw new ValidationError(
            'Удаление сделает накопления цели отрицательными',
          );
        }
        return probe;
      }, 'Операция удалена');
    },
    [run],
  );

  const restoreTransaction = useCallback(
    (id: string) => {
      return run((d) => {
        const tx = d.transactions.find((t) => t.id === id);
        if (!tx) throw new ValidationError('Операция не найдена');
        const restored: Transaction = { ...tx, deletedAt: null };
        const next: BudgetData = {
          ...d,
          transactions: d.transactions.map((t) => (t.id === id ? restored : t)),
        };
        if (tx.goalId && !goalSeriesStaysPositive(next, tx.goalId)) {
          throw new ValidationError(
            'Восстановление сделает накопления цели отрицательными',
          );
        }
        return next;
      }, 'Операция восстановлена');
    },
    [run],
  );

  const createCategory = useCallback(
    (input: Partial<Category>) => {
      return run((d) => {
        const v = validateCategoryInput(d, input);
        const id = newId();
        const siblings = d.categories.filter(
          (c) => c.kind === v.kind && c.parentId === v.parentId,
        );
        const c: Category = {
          id,
          name: v.n,
          kind: v.kind,
          parentId: v.parentId,
          icon: input.icon ?? '',
          color:
            input.color ??
            v.parent?.color ??
            pickColor(CATEGORY_COLORS, siblings.length),
          isArchived: false,
          sortOrder: nextSortOrder(siblings),
        };
        return { ...d, categories: [...d.categories, c] };
      }, 'Категория создана');
    },
    [run],
  );

  const updateCategory = useCallback(
    (id: string, patch: Partial<Category>) => {
      return run((d) => {
        const cur = d.categories.find((c) => c.id === id);
        if (!cur) throw new ValidationError('Категория не найдена');
        if (id === 'other' && patch.isArchived === true)
          categoryArchivable(d, id);
        const merged: Category = {
          ...cur,
          name: patch.name ?? cur.name,
          kind: patch.kind ?? cur.kind,
          parentId:
            patch.parentId !== undefined ? patch.parentId : cur.parentId,
          color: patch.color ?? cur.color,
          icon: patch.icon ?? cur.icon,
          isArchived: patch.isArchived ?? cur.isArchived,
          sortOrder: patch.sortOrder ?? cur.sortOrder,
        };
        const used =
          d.transactions.some((t) => t.categoryId === id && !t.deletedAt) ||
          d.envelopes.some((e) => e.categoryId === id);
        if (used) {
          if (merged.kind !== cur.kind)
            throw new ValidationError(
              'Тип категории с операциями менять нельзя',
            );
          if (merged.parentId !== cur.parentId)
            throw new ValidationError(
              'Родителя категории с операциями менять нельзя',
            );
        }
        if (merged.isArchived && !cur.isArchived) categoryArchivable(d, id);
        const v = validateCategoryInput(d, merged, id);
        merged.name = v.n;
        merged.color = v.color;
        return {
          ...d,
          categories: d.categories.map((c) => (c.id === id ? merged : c)),
        };
      }, 'Категория обновлена');
    },
    [run],
  );

  const deleteCategory = useCallback(
    (id: string) => {
      return run((d) => {
        categoryDeletable(d, id);
        return {
          ...d,
          categories: d.categories.filter(
            (c) => c.id !== id && c.parentId !== id,
          ),
        };
      }, 'Категория удалена');
    },
    [run],
  );

  const upsertIncomeSource = useCallback(
    (input: Partial<IncomeSource>, id?: string) => {
      return run(
        (d) => {
          const v = validateIncomeSourceInput(d, input, id);
          if (id) {
            const cur = d.incomeSources.find((s) => s.id === id);
            if (!cur) throw new ValidationError('Источник не найден');
            const next: IncomeSource = {
              ...cur,
              name: v.n,
              amount: v.amount,
              schedule: v.schedule,
              dayOfMonth: v.day,
              isActive: input.isActive ?? cur.isActive,
              sortOrder: input.sortOrder ?? cur.sortOrder,
            };
            const linked = d.transactions.some(
              (t) => t.incomeSourceId === id && !t.deletedAt,
            );
            return {
              ...d,
              incomeSources: d.incomeSources.map((s) =>
                s.id === id ? next : s,
              ),
              transactions: linked
                ? d.transactions.map((t) =>
                    t.incomeSourceId === id && !t.deletedAt
                      ? { ...t, amount: v.amount }
                      : t,
                  )
                : d.transactions,
            };
          }
          const s: IncomeSource = {
            id: newId(),
            name: v.n,
            amount: v.amount,
            schedule: v.schedule,
            dayOfMonth: v.day,
            isActive: input.isActive ?? true,
            sortOrder: nextSortOrder(d.incomeSources),
          };
          return { ...d, incomeSources: [...d.incomeSources, s] };
        },
        id ? 'Источник обновлён' : 'Источник добавлен',
      );
    },
    [run],
  );

  const deleteIncomeSource = useCallback(
    (id: string) => {
      return run((d) => {
        if (
          d.transactions.some((t) => t.incomeSourceId === id && !t.deletedAt)
        ) {
          throw new ValidationError(
            'Источник используется в операциях — снимите активность или удалите операции',
          );
        }
        return {
          ...d,
          incomeSources: d.incomeSources.filter((s) => s.id !== id),
        };
      }, 'Источник удалён');
    },
    [run],
  );

  const upsertObligation = useCallback(
    (input: Partial<Obligation>, id?: string) => {
      return run(
        (d) => {
          const v = validateObligationInput(d, input, id);
          if (id) {
            const cur = d.obligations.find((o) => o.id === id);
            if (!cur) throw new ValidationError('Обязательство не найдено');
            const next: Obligation = {
              ...cur,
              name: v.n,
              amount: v.amount,
              dayOfMonth: v.day,
              categoryId: v.categoryId,
              isActive: input.isActive ?? cur.isActive,
              sortOrder: input.sortOrder ?? cur.sortOrder,
            };
            const linked = d.transactions.some(
              (t) => t.obligationId === id && !t.deletedAt,
            );
            return {
              ...d,
              obligations: d.obligations.map((o) => (o.id === id ? next : o)),
              transactions: linked
                ? d.transactions.map((t) =>
                    t.obligationId === id && !t.deletedAt
                      ? { ...t, amount: v.amount }
                      : t,
                  )
                : d.transactions,
            };
          }
          const o: Obligation = {
            id: newId(),
            name: v.n,
            amount: v.amount,
            dayOfMonth: v.day,
            categoryId: v.categoryId,
            isActive: input.isActive ?? true,
            sortOrder: nextSortOrder(d.obligations),
          };
          return { ...d, obligations: [...d.obligations, o] };
        },
        id ? 'Обязательство обновлено' : 'Обязательство добавлено',
      );
    },
    [run],
  );

  const deleteObligation = useCallback(
    (id: string) => {
      return run((d) => {
        if (d.transactions.some((t) => t.obligationId === id && !t.deletedAt)) {
          throw new ValidationError(
            'Обязательство используется в операциях — снимите активность или удалите операции',
          );
        }
        return { ...d, obligations: d.obligations.filter((o) => o.id !== id) };
      }, 'Обязательство удалено');
    },
    [run],
  );

  const upsertGoal = useCallback(
    (input: Partial<Goal>, id?: string) => {
      return run(
        (d) => {
          const v = validateGoalInput(d, input, id);
          if (id) {
            const cur = d.goals.find((g) => g.id === id);
            if (!cur) throw new ValidationError('Цель не найдена');
            const next: Goal = {
              ...cur,
              name: v.n,
              targetAmount: v.targetAmount,
              targetDate: v.targetDate,
              color: v.color,
              icon: v.icon,
              status: input.status ?? cur.status,
              sortOrder: input.sortOrder ?? cur.sortOrder,
            };
            const probe: BudgetData = {
              ...d,
              goals: d.goals.map((g) => (g.id === id ? next : g)),
            };
            if (!goalSeriesStaysPositive(probe, id))
              throw new ValidationError(
                'История накоплений станет отрицательной',
              );
            return probe;
          }
          const g: Goal = {
            id: newId(),
            name: v.n,
            targetAmount: v.targetAmount,
            targetDate: v.targetDate,
            color: v.color,
            icon: v.icon,
            status: 'active',
            sortOrder: nextSortOrder(d.goals),
          };
          return { ...d, goals: [...d.goals, g] };
        },
        id ? 'Цель обновлена' : 'Цель создана',
      );
    },
    [run],
  );

  const deleteGoal = useCallback(
    (id: string) => {
      return run((d) => {
        if (goalUsedByTransactions(d, id))
          throw new ValidationError(
            'По цели есть операции — архивируйте её вместо удаления',
          );
        return { ...d, goals: d.goals.filter((g) => g.id !== id) };
      }, 'Цель удалена');
    },
    [run],
  );

  const setEnvelopeLimit = useCallback(
    (categoryId: string, limitAmount: number, periodId?: string) => {
      return run((d) => {
        envelopeCategoryOk(d, categoryId);
        const limit = validateEnvelopeLimit(limitAmount);
        const pid = periodId ?? activePeriod(d)?.id;
        if (!pid) throw new ValidationError('Нет активного периода');
        if (!d.periods.some((p) => p.id === pid))
          throw new ValidationError('Период не найден');
        const idx = d.envelopes.findIndex(
          (e) => e.periodId === pid && e.categoryId === categoryId,
        );
        const envelopes =
          idx >= 0
            ? d.envelopes.map((e, i) =>
                i === idx ? { ...e, limitAmount: limit } : e,
              )
            : [
                ...d.envelopes,
                {
                  id: `${pid}:${categoryId}`,
                  periodId: pid,
                  categoryId,
                  limitAmount: limit,
                  carryOverAmount: 0,
                },
              ];
        return { ...d, envelopes };
      }, 'Лимит конверта сохранён');
    },
    [run],
  );

  const createPeriodsUpTo = useCallback(
    (date: string) => {
      return run((d) => {
        const target = date.slice(0, 7);
        const start = activePeriod(d)?.id ?? target;
        const missing: string[] = [];
        for (let i = 0; i < 36 && addMonthId(start, i) <= target; i++) {
          const pid = addMonthId(start, i);
          if (!d.periods.some((p) => p.id === pid)) missing.push(pid);
        }
        if (!missing.length) return d;
        let next = d;
        for (const pid of missing) {
          const period = buildPeriod(pid);
          period.status = next.envelopes.some(
            (e) => e.periodId === prevMonthId(pid),
          )
            ? 'pending_review'
            : 'closed';
          next = {
            ...next,
            periods: [...next.periods, period],
            envelopes: [
              ...next.envelopes,
              ...cloneEnvelopes(next, prevMonthId(pid), pid),
            ],
          };
        }
        return {
          ...next,
          periods: next.periods.sort((a, b) => b.id.localeCompare(a.id)),
        };
      }, 'Период создан');
    },
    [run],
  );

  const applyClosures = useCallback((closureDraft: ClosureDraft) => {
    return run((d) => {
      const pending = pendingReviewPeriod(d);
      const next = activePeriod(d);
      if (!pending || !next)
        throw new ValidationError('Нет периода, ожидающего разбора');
      const nextPid = next.id;
      const envelopes = d.envelopes.filter((e) => e.periodId === pending.id);
      const leftovers = new Map<
        string,
        { amount: number; categoryId: string }
      >();
      for (const env of envelopes) {
        leftovers.set(env.id, {
          amount:
            env.limitAmount +
            env.carryOverAmount -
            spentFor(d, env.categoryId, pending.id),
          categoryId: env.categoryId,
        });
      }
      const newClosures: PeriodClosure[] = [];
      const newTxs: Transaction[] = [];
      const envelopeUpdates = new Map<string, number>();
      const decided = envelopes.filter((e) => closureDraft[e.id]);
      if (!decided.length)
        throw new ValidationError('Сначала примите решения по конвертам');

      for (const env of decided) {
        const draft = closureDraft[env.id];
        if (d.closures.some((c) => c.envelopeId === env.id))
          throw new ValidationError('Решения по этому периоду уже приняты');
        validateClosureInput(d, {
          envelopeId: env.id,
          decision: draft.decision,
          goalId: draft.goalId,
        });
        const info = leftovers.get(env.id)!;
        const leftover = Math.max(0, info.amount);
        newClosures.push({
          envelopeId: env.id,
          decision: draft.decision,
          leftoverAmount: info.amount,
          goalId: draft.decision === 'to_goal' ? draft.goalId : null,
        });
        if (draft.decision === 'carry_over' && leftover > 0) {
          const targetId = `${nextPid}:${info.categoryId}`;
          if (!envelopeUpdates.has(targetId)) {
            const t = d.envelopes.find((e) => e.id === targetId);
            if (!t)
              throw new ValidationError(
                'В следующем периоде нет конверта для переноса',
              );
            envelopeUpdates.set(targetId, t.carryOverAmount);
          }
          envelopeUpdates.set(
            targetId,
            envelopeUpdates.get(targetId)! + leftover,
          );
        }
        if (draft.decision === 'to_goal' && leftover > 0 && draft.goalId) {
          const v = validateTransactionInput(d, {
            type: 'goal_deposit',
            amount: leftover,
            date: next.startDate,
            goalId: draft.goalId,
            comment: 'Перевод из конверта',
          });
          newTxs.push({
            id: newId(),
            type: 'goal_deposit',
            amount: v.amount,
            date: v.date,
            categoryId: null,
            periodId: v.periodId,
            goalId: v.goalId,
            incomeSourceId: null,
            obligationId: null,
            comment: v.comment,
            createdAt: Date.now(),
            deletedAt: null,
          });
        }
      }
      return {
        ...d,
        envelopes: d.envelopes.map((e) =>
          envelopeUpdates.has(e.id)
            ? { ...e, carryOverAmount: envelopeUpdates.get(e.id)! }
            : e,
        ),
        closures: [...d.closures, ...newClosures],
        transactions: [...d.transactions, ...newTxs],
        periods: d.periods.map((p) =>
          p.id === pending.id ? { ...p, status: 'closed' as const } : p,
        ),
      };
    }, 'Разбор периода завершён');
  }, [run]);

  const exportSnapshot = useCallback(
    () =>
      JSON.stringify(
        {
          schemaVersion: 1,
          incomeSources: data.incomeSources,
          obligations: data.obligations,
          categories: data.categories,
          periods: data.periods,
          envelopes: data.envelopes,
          periodClosures: data.closures,
          transactions: data.transactions,
          goals: data.goals,
          settings: {
            theme: 'system',
            dailyReminderEnabled: false,
            dailyReminderTime: '20:00',
            payoutReminderEnabled: false,
          },
        },
        null,
        2,
      ),
    [data],
  );

  const importSnapshot = useCallback(
    (json: string) => {
      return run((d) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(json);
        } catch {
          throw new ValidationError('Невалидный JSON');
        }
        const o = parsed as Record<string, unknown>;
        if (o.schemaVersion !== 1)
          throw new ValidationError('Неподдерживаемая версия снимка');
        for (const key of [
          'incomeSources',
          'obligations',
          'categories',
          'periods',
          'envelopes',
          'transactions',
          'goals',
        ] as const) {
          if (!Array.isArray(o[key]))
            throw new ValidationError(`Поле ${key} должно быть массивом`);
        }
        const cats = new Set((o.categories as Category[]).map((c) => c.id));
        const goalIds = new Set((o.goals as Goal[]).map((g) => g.id));
        const periodIds = new Set((o.periods as Period[]).map((p) => p.id));
        const srcIds = new Set(
          (o.incomeSources as IncomeSource[]).map((s) => s.id),
        );
        const oblIds = new Set(
          (o.obligations as Obligation[]).map((x) => x.id),
        );
        for (const t of o.transactions as Transaction[]) {
          if (t.categoryId && !cats.has(t.categoryId))
            throw new ValidationError(
              `Операция ${t.id}: неизвестная категория`,
            );
          if (t.goalId && !goalIds.has(t.goalId))
            throw new ValidationError(`Операция ${t.id}: неизвестная цель`);
          if (t.incomeSourceId && !srcIds.has(t.incomeSourceId))
            throw new ValidationError(`Операция ${t.id}: неизвестный источник`);
          if (t.obligationId && !oblIds.has(t.obligationId))
            throw new ValidationError(
              `Операция ${t.id}: неизвестное обязательство`,
            );
          if (!periodIds.has(t.periodId))
            throw new ValidationError(`Операция ${t.id}: неизвестный период`);
        }
        for (const g of o.goals as Goal[]) {
          if (g.status === 'completed' && g.targetAmount <= 0)
            throw new ValidationError(`Цель ${g.id}: некорректная сумма`);
        }
        return {
          ...d,
          incomeSources: o.incomeSources as IncomeSource[],
          obligations: o.obligations as Obligation[],
          categories: o.categories as Category[],
          periods: o.periods as Period[],
          envelopes: o.envelopes as Envelope[],
          closures: Array.isArray(o.periodClosures)
            ? (o.periodClosures as PeriodClosure[])
            : [],
          transactions: o.transactions as Transaction[],
          goals: o.goals as Goal[],
        };
      }, 'Снимок импортирован');
    },
    [run],
  );

  const resetData = useCallback(
    () => run(() => structuredClone(initialData), 'Демобюджет восстановлен'),
    [run],
  );

  const value = useMemo<BudgetContextValue>(
    () => ({
      data,
      busy: false,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      restoreTransaction,
      createCategory,
      updateCategory,
      deleteCategory,
      upsertIncomeSource,
      deleteIncomeSource,
      upsertObligation,
      deleteObligation,
      upsertGoal,
      deleteGoal,
      setEnvelopeLimit,
      createPeriodsUpTo,
      applyClosures,
      exportSnapshot,
      importSnapshot,
      resetData,
    }),
    [
      data,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      restoreTransaction,
      createCategory,
      updateCategory,
      deleteCategory,
      upsertIncomeSource,
      deleteIncomeSource,
      upsertObligation,
      deleteObligation,
      upsertGoal,
      deleteGoal,
      setEnvelopeLimit,
      createPeriodsUpTo,
      applyClosures,
      exportSnapshot,
      importSnapshot,
      resetData,
    ],
  );

  return (
    <BudgetContext.Provider value={value}>
      <ToastContext.Provider value={toasts}>
        {children}
      </ToastContext.Provider>
    </BudgetContext.Provider>
  );
}

function buildTx(
  d: BudgetData,
  input: NewTransaction,
  id: string,
  createdAt: number,
): Transaction {
  const v = validateTransactionInput(d, { ...input });
  return {
    id,
    type: input.type,
    amount: v.amount,
    date: v.date,
    categoryId: v.categoryId,
    periodId: v.periodId,
    goalId: v.goalId,
    incomeSourceId: v.incomeSourceId,
    obligationId: v.obligationId,
    comment: v.comment,
    createdAt,
    deletedAt: null,
  };
}
