import type {
  BudgetData,
  Category,
  EnvelopeView,
  EnvelopeStatus,
  Obligation,
  Period,
  Transaction,
} from '../types';
import { diffDays, nextScheduleDate, parseDate, toISO, addDays } from './dates';

export function periodOf(data: BudgetData, id: string): Period | undefined {
  return data.periods.find((p) => p.id === id);
}

export function activePeriod(data: BudgetData): Period | undefined {
  return data.periods.find((p) => p.status === 'active');
}

export function pendingReviewPeriod(data: BudgetData): Period | undefined {
  return data.periods
    .filter((period) => period.status === 'pending_review')
    .sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
}

export function categoryById(
  data: BudgetData,
  id: string | null,
): Category | undefined {
  return data.categories.find((c) => c.id === id);
}

export function childrenOf(
  data: BudgetData,
  parentId: string,
  { includeArchived = false } = {},
): Category[] {
  return data.categories
    .filter((c) => c.parentId === parentId && (includeArchived || !c.isArchived))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** id категории + всех её подкатегорий */
export function categoryTreeIds(data: BudgetData, rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  const walk = (pid: string) => {
    for (const c of childrenOf(data, pid, { includeArchived: true })) {
      if (ids.has(c.id)) continue;
      ids.add(c.id);
      walk(c.id);
    }
  };
  walk(rootId);
  return ids;
}

export function isLive(tx: Transaction): boolean {
  return tx.deletedAt === null;
}

function txInPeriod(
  tx: Transaction,
  period: Period,
  upToDate?: string,
): boolean {
  return (
    isLive(tx) &&
    tx.date >= period.startDate &&
    tx.date <= period.endDate &&
    (!upToDate || tx.date <= upToDate)
  );
}

/** расход по категории (с подкатегориями) внутри периода, не позже upToDate */
export function spentFor(
  data: BudgetData,
  categoryId: string,
  periodId: string,
  upToDate?: string,
): number {
  const period = periodOf(data, periodId);
  if (!period) return 0;
  const ids = categoryTreeIds(data, categoryId);
  return data.transactions
    .filter(
      (t) =>
        t.type === 'expense' &&
        ids.has(t.categoryId ?? '') &&
        txInPeriod(t, period, upToDate),
    )
    .reduce((s, t) => s + t.amount, 0);
}

export function envelopeStatus(
  remaining: number,
  budget: number,
  spent: number,
): EnvelopeStatus {
  if (budget <= 0) return spent > 0 ? 'over' : 'ok';
  if (remaining < 0) return 'over';
  if (spent / budget >= 0.8) return 'warning';
  return 'ok';
}

export function envelopeViews(
  data: BudgetData,
  periodId: string,
  upToDate?: string,
): EnvelopeView[] {
  const period = periodOf(data, periodId);
  if (!period) return [];
  return data.envelopes
    .filter((e) => e.periodId === periodId)
    .map((e) => {
      const spent = spentFor(data, e.categoryId, periodId, upToDate);
      const budget = e.limitAmount + e.carryOverAmount;
      const remaining = budget - spent;
      return {
        ...e,
        spent,
        remaining,
        status: envelopeStatus(remaining, budget, spent),
      };
    })
    .sort((a, b) => {
      const rank = { over: 0, warning: 1, ok: 2 } as const;
      return rank[a.status] - rank[b.status] || a.remaining - b.remaining;
    });
}

/** баланс периода на дату: доходы − расходы − пополнения целей (+изъятия) */
export function balance(
  data: BudgetData,
  periodId: string,
  upToDate?: string,
): number {
  const period = periodOf(data, periodId);
  if (!period) return 0;
  let sum = 0;
  for (const t of data.transactions) {
    if (!txInPeriod(t, period, upToDate)) continue;
    if (t.type === 'income' || t.type === 'goal_withdrawal') sum += t.amount;
    else sum -= t.amount;
  }
  return sum;
}

/** ближайшая будущая дата выплаты по активным источникам (irregular не считается) */
export function nextIncomeDate(
  data: BudgetData,
  fromISO: string,
): string | null {
  let best: string | null = null;
  for (const src of data.incomeSources) {
    if (!src.isActive || src.schedule === 'irregular') continue;
    const d = nextScheduleDate(src.schedule, src.dayOfMonth, fromISO);
    if (d) {
      const iso = toISO(d);
      if (!best || iso < best) best = iso;
    }
  }
  return best;
}

/** резерв: активные обязательства с датой позже сегодня и не позже ближайшей выплаты */
export function reserved(
  data: BudgetData,
  periodId: string,
  todayISO: string,
): number {
  const horizon = nextIncomeDate(data, todayISO);
  const period = periodOf(data, periodId);
  const periodEnd =
    horizon && period && horizon > period.endDate ? period.endDate : horizon;
  let sum = 0;
  for (const ob of data.obligations) {
    if (!ob.isActive) continue;
    const d = nextScheduleDate('monthly_day', ob.dayOfMonth, todayISO);
    if (!d) continue;
    const iso = toISO(d);
    if (iso <= todayISO) continue; // уже должно быть оплачено / сегодняшнее
    const limit = periodEnd ?? period?.endDate;
    if (!limit || iso > limit) continue;
    // обязательство должно попасть в резерв, только если ещё не оплачено операцией
    const paid = data.transactions.some(
      (t) =>
        isLive(t) &&
        t.obligationId === ob.id &&
        t.date.slice(0, 7) === periodId &&
        t.date >= todayISO,
    );
    if (!paid) sum += ob.amount;
  }
  return sum;
}

export interface DashboardCalc {
  balance: number;
  reserved: number;
  available: number;
  nextIncomeDate: string | null;
  daysLeft: number;
  dailyLimit: number;
  horizon: string;
}

export function dashboard(
  data: BudgetData,
  periodId: string,
  todayISO: string,
): DashboardCalc {
  const period = periodOf(data, periodId);
  const bal = balance(data, periodId, todayISO);
  const res = reserved(data, periodId, todayISO);
  const next = nextIncomeDate(data, todayISO);
  const horizon = next ?? period?.endDate ?? todayISO;
  const daysLeft = Math.max(0, diffDays(todayISO, horizon));
  const available = bal - res;
  const dailyLimit =
    daysLeft === 0 ? available : Math.floor(available / daysLeft);
  return {
    balance: bal,
    reserved: res,
    available,
    nextIncomeDate: next,
    daysLeft,
    dailyLimit,
    horizon,
  };
}

/** накопления цели на дату */
export function goalSaved(
  data: BudgetData,
  goalId: string,
  upToDate?: string,
): number {
  let sum = 0;
  for (const t of data.transactions) {
    if (!isLive(t) || t.goalId !== goalId) continue;
    if (upToDate && t.date > upToDate) continue;
    if (t.type === 'goal_deposit') sum += t.amount;
    else if (t.type === 'goal_withdrawal') sum -= t.amount;
  }
  return sum;
}

export function goalView(data: BudgetData, goalId: string, todayISO: string) {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal) return null;
  const saved = goalSaved(data, goalId, todayISO);
  const remaining = Math.max(0, goal.targetAmount - saved);
  let perMonth: number | null = null;
  if (goal.targetDate && goal.status === 'active' && remaining > 0) {
    const months = Math.max(
      1,
      (parseDate(goal.targetDate).getUTCFullYear() -
        parseDate(todayISO).getUTCFullYear()) *
        12 +
        (parseDate(goal.targetDate).getUTCMonth() -
          parseDate(todayISO).getUTCMonth()),
    );
    perMonth = Math.ceil(remaining / months / 100) * 100;
  }
  return { goal, saved, remaining, perMonth };
}

/** категории расходов верхнего уровня с суммами за период (для donut) */
export function expenseByCategory(
  data: BudgetData,
  periodId: string,
): {
  category: Category;
  amount: number;
  children: { category: Category; amount: number }[];
}[] {
  const period = periodOf(data, periodId);
  if (!period) return [];
  const result: {
    category: Category;
    amount: number;
    children: { category: Category; amount: number }[];
  }[] = [];
  for (const cat of data.categories) {
    if (cat.kind !== 'expense' || cat.parentId !== null)
      continue;
    const ids = categoryTreeIds(data, cat.id);
    const amount = data.transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          ids.has(t.categoryId ?? '') &&
          txInPeriod(t, period),
      )
      .reduce((s, t) => s + t.amount, 0);
    const children = childrenOf(data, cat.id, { includeArchived: true }).map((c) => ({
      category: c,
      amount: data.transactions
        .filter(
          (t) =>
            t.type === 'expense' &&
            t.categoryId === c.id &&
            txInPeriod(t, period),
        )
        .reduce((s, t) => s + t.amount, 0),
    }));
    result.push({ category: cat, amount, children });
  }
  return result.sort((a, b) => b.amount - a.amount);
}

export function periodTotalExpense(data: BudgetData, periodId: string): number {
  return expenseByCategory(data, periodId).reduce((s, c) => s + c.amount, 0);
}

/** предыдущий месяц для periodId вида YYYY-MM */
export function prevPeriodId(periodId: string): string | null {
  const [y, m] = periodId.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** ближайшая дата следующего платежа обязательства после today */
export function obligationNextDate(
  ob: Obligation,
  todayISO: string,
): string | null {
  const d = nextScheduleDate('monthly_day', ob.dayOfMonth, todayISO);
  return d ? toISO(d) : null;
}

export { addDays, parseDate, toISO };
