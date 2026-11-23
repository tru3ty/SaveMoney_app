import type {
  BudgetData,
  Category,
  Goal,
  IncomeSource,
  Obligation,
  PeriodClosure,
  Transaction,
  TransactionType,
} from '../types';

const MAX_SAFE = 9007199254740991;
const NAME_MAX = 100;

export class ValidationError extends Error {}

function fail(msg: string): never {
  throw new ValidationError(msg);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}
function isMoney(v: unknown, allowZero: boolean): v is number {
  return isInt(v) && v >= 0 && v <= MAX_SAFE && (allowZero || v > 0);
}
function isDate(v: unknown): v is string {
  return (
    isStr(v) &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
  );
}
function isHexColor(v: unknown): v is string {
  return isStr(v) && /^#[0-9a-fA-F]{6}$/.test(v);
}
function name(v: unknown): string {
  if (!isStr(v)) fail('Название должно быть строкой');
  const t = v.trim();
  if (t.length < 1 || t.length > NAME_MAX)
    fail(`Название: от 1 до ${NAME_MAX} символов`);
  return t;
}

const COLOR_PRESETS = [
  '#34a06a',
  '#0ea5e9',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#64748b',
  '#f97316',
];
export const pickColor = (colors: readonly string[], index: number) =>
  colors[index % colors.length];

// ---------- income sources ----------

export function validateIncomeSourceInput(
  d: BudgetData,
  input: Partial<IncomeSource>,
  id?: string,
) {
  const n = name(input.name ?? '');
  const amount = input.amount ?? 0;
  if (!isMoney(amount, false))
    fail('Сумма должна быть положительной (целые копейки)');
  const schedule = input.schedule ?? 'monthly_day';
  if (!['monthly_day', 'monthly_last_day', 'irregular'].includes(schedule))
    fail('Неизвестный график');
  const day = input.dayOfMonth ?? null;
  if (schedule === 'monthly_day') {
    if (!isInt(day) || day! < 1 || day! > 31)
      fail('Для графика «день месяца» нужен день 1–31');
  } else if (day !== null) {
    fail('День месяца допустим только для графика «день месяца»');
  }
  const dup = d.incomeSources.find(
    (s) => s.id !== id && s.name.toLowerCase() === n.toLowerCase(),
  );
  if (dup) fail(`Источник «${dup.name}» уже есть`);
  return { n, amount, schedule: schedule as IncomeSource['schedule'], day };
}

// ---------- obligations ----------

export function validateObligationInput(
  d: BudgetData,
  input: Partial<Obligation>,
  id?: string,
) {
  const n = name(input.name ?? '');
  const amount = input.amount ?? 0;
  if (!isMoney(amount, false)) fail('Сумма должна быть положительной');
  const day = input.dayOfMonth ?? 0;
  if (!isInt(day) || day < 1 || day > 31) fail('День списания: 1–31');
  const categoryId = input.categoryId ?? null;
  if (categoryId !== null) {
    const c = d.categories.find((x) => x.id === categoryId);
    if (!c || c.kind !== 'expense' || c.isArchived)
      fail('Категория обязательства должна быть расходной и активной');
  }
  const dup = d.obligations.find(
    (o) => o.id !== id && o.name.toLowerCase() === n.toLowerCase(),
  );
  if (dup) fail(`Обязательство «${dup.name}» уже есть`);
  return { n, amount, day, categoryId };
}

// ---------- categories ----------

export function validateCategoryInput(
  d: BudgetData,
  input: Partial<Category>,
  id?: string,
) {
  const n = name(input.name ?? '');
  const kind = input.kind ?? 'expense';
  if (kind !== 'expense' && kind !== 'income')
    fail('Тип категории: expense или income');
  const color = input.color ?? '#34a06a';
  if (!isHexColor(color)) fail('Цвет — #RRGGBB');
  const parentId = input.parentId ?? null;
  let parent: Category | undefined;
  if (parentId !== null) {
    parent = d.categories.find((c) => c.id === parentId);
    if (!parent) fail('Родительская категория не найдена');
    if (parent.kind !== kind) fail('Родитель должен быть того же типа');
    if (parent.parentId !== null) fail('Не больше двух уровней вложенности');
    if (id && parentId === id)
      fail('Категория не может быть родителем самой себя');
  }
  const dup = d.categories.find(
    (c) =>
      c.id !== id &&
      c.kind === kind &&
      c.parentId === parentId &&
      c.name.toLowerCase() === n.toLowerCase(),
  );
  if (dup) fail(`Категория «${dup.name}» уже есть`);
  return { n, kind, color, parentId, parent };
}

export function categoryDeletable(d: BudgetData, id: string) {
  if (id === 'other') fail('Категорию «Прочее» удалять нельзя');
  if (d.transactions.some((t) => t.categoryId === id && !t.deletedAt)) {
    fail(
      'Категория используется в операциях — сначала удалите или измените их',
    );
  }
  if (d.envelopes.some((e) => e.categoryId === id))
    fail('По категории есть конверт');
  if (d.obligations.some((o) => o.categoryId === id))
    fail('Категория привязана к обязательству');
  const children = d.categories.filter((c) => c.parentId === id);
  if (children.length) fail('Сначала удалите или перенесите подкатегории');
}

export function categoryArchivable(d: BudgetData, id: string) {
  if (id === 'other') fail('Категорию «Прочее» архивировать нельзя');
  const hasActiveChildren = d.categories.some(
    (c) => c.parentId === id && !c.isArchived,
  );
  if (hasActiveChildren) fail('Сначала архивируйте или удалите подкатегории');
}

// ---------- goals ----------

export function validateGoalInput(
  d: BudgetData,
  input: Partial<Goal>,
  id?: string,
) {
  const n = name(input.name ?? '');
  const targetAmount = input.targetAmount ?? 0;
  if (!isMoney(targetAmount, false))
    fail('Сумма цели должна быть положительной');
  const targetDate = input.targetDate ?? null;
  if (targetDate !== null && !isDate(targetDate))
    fail('Дата цели — YYYY-MM-DD');
  const color = input.color ?? '#34a06a';
  if (!isHexColor(color)) fail('Цвет — #RRGGBB');
  const icon = input.icon ?? '';
  if (icon.length > 16) fail('Иконка не длиннее 16 символов');
  const dup = d.goals.find(
    (g) =>
      g.id !== id &&
      g.name.toLowerCase() === n.toLowerCase() &&
      g.status !== 'archived',
  );
  if (dup) fail(`Цель «${dup.name}» уже есть`);
  return { n, targetAmount, targetDate, color, icon };
}

/** накопления по дням для цели (учёт всех живых операций до today) */
export function goalBalanceSeries(
  d: BudgetData,
  goalId: string,
): { date: string; sum: number }[] {
  const byDate = new Map<string, number>();
  for (const t of d.transactions) {
    if (t.goalId !== goalId || t.deletedAt) continue;
    const delta =
      t.type === 'goal_deposit'
        ? t.amount
        : t.type === 'goal_withdrawal'
          ? -t.amount
          : 0;
    if (!delta) continue;
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + delta);
  }
  let run = 0;
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, delta]) => ({ date, sum: (run += delta) }));
}

export function goalSeriesStaysPositive(
  d: BudgetData,
  goalId: string,
  extra?: Transaction,
  ignoreId?: string,
): boolean {
  const byDate = new Map<string, number>();
  const add = (t: Transaction) => {
    const delta =
      t.type === 'goal_deposit'
        ? t.amount
        : t.type === 'goal_withdrawal'
          ? -t.amount
          : 0;
    if (!delta) return;
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + delta);
  };
  for (const t of d.transactions) {
    if (t.goalId === goalId && !t.deletedAt && t.id !== ignoreId) add(t);
  }
  if (extra && extra.goalId === goalId) add(extra);
  let run = 0;
  for (const delta of [...byDate.values()]) {
    run += delta;
    if (run < 0) return false;
  }
  return true;
}

export function goalUsedByTransactions(d: BudgetData, goalId: string) {
  return d.transactions.some((t) => t.goalId === goalId && !t.deletedAt);
}

// ---------- envelopes ----------

export function validateEnvelopeLimit(limitAmount: unknown) {
  if (!isMoney(limitAmount, true))
    fail('Лимит конверта — целое число копеек ≥ 0');
  return limitAmount;
}

export function envelopeCategoryOk(d: BudgetData, categoryId: string) {
  const c = d.categories.find((x) => x.id === categoryId);
  if (!c) fail('Категория не найдена');
  if (c.kind !== 'expense')
    fail('Конверт можно задать только для расходной категории');
  if (c.isArchived) fail('Категория архивирована');
  if (c.parentId !== null) fail('Лимит задаётся на категорию верхнего уровня');
  return c;
}

// ---------- transactions ----------

export function validateTransactionInput(
  d: BudgetData,
  input: Partial<Transaction> & { type: TransactionType },
  opts: { ignoreId?: string } = {},
) {
  const type = input.type;
  const amount = input.amount ?? 0;
  if (!isMoney(amount, false)) fail('Сумма должна быть положительной');
  const date = input.date ?? '';
  if (!isDate(date)) fail('Дата — YYYY-MM-DD');
  const comment = input.comment ?? '';
  if (comment.length > 500) fail('Комментарий не длиннее 500 символов');
  const periodId = date.slice(0, 7);
  if (!d.periods.some((p) => p.id === periodId))
    fail(`Период ${periodId} не создан`);

  let categoryId: string | null = null;
  let goalId: string | null = null;
  let incomeSourceId: string | null = null;
  let obligationId: string | null = null;

  if (type === 'income' || type === 'expense') {
    const want = type === 'income' ? 'income' : 'expense';
    const cid = input.categoryId ?? null;
    const c = cid ? d.categories.find((x) => x.id === cid) : undefined;
    if (!c) fail('Выберите категорию');
    if (c.kind !== want)
      fail(
        `Категория должна быть типа «${want === 'income' ? 'доход' : 'расход'}»`,
      );
    if (c.isArchived) fail('Категория архивирована');
    categoryId = c.id;
  } else {
    // для накоплений категория не нужна
    if (input.categoryId)
      fail('У операции накопления не должно быть категории');
  }

  if (type === 'income') {
    const sid = input.incomeSourceId ?? null;
    if (sid !== null && !d.incomeSources.some((s) => s.id === sid))
      fail('Источник дохода не найден');
    incomeSourceId = sid;
  } else if (input.incomeSourceId) {
    fail('Источник дохода допустим только для дохода');
  }

  if (type === 'expense') {
    const oid = input.obligationId ?? null;
    if (oid !== null && !d.obligations.some((o) => o.id === oid))
      fail('Обязательство не найдено');
    obligationId = oid;
  } else if (input.obligationId) {
    fail('Обязательство допустимо только для расхода');
  }

  if (type === 'goal_deposit' || type === 'goal_withdrawal') {
    const gid = input.goalId ?? null;
    const g = gid ? d.goals.find((x) => x.id === gid) : undefined;
    if (!g) fail('Выберите цель');
    if (g.status === 'archived') fail('Цель архивирована');
    goalId = g.id;
  } else if (input.goalId) {
    fail('Цель допустима только для накоплений');
  }

  const extra: Transaction = {
    id: opts.ignoreId ?? 'tmp',
    type,
    amount,
    date,
    categoryId,
    periodId,
    goalId,
    incomeSourceId,
    obligationId,
    comment,
    createdAt: 0,
    deletedAt: null,
  };
  if (goalId && !goalSeriesStaysPositive(d, goalId, extra, opts.ignoreId)) {
    fail('Снятие сделает накопления цели отрицательными');
  }
  return extra;
}

// ---------- period closures ----------

export function validateClosureInput(
  d: BudgetData,
  input: {
    envelopeId: string;
    decision: PeriodClosure['decision'];
    goalId?: string | null;
  },
) {
  const env = d.envelopes.find((e) => e.id === input.envelopeId);
  if (!env) fail('Конверт не найден');
  const period = d.periods.find((p) => p.id === env.periodId);
  if (!period || period.status !== 'pending_review')
    fail('Период не ждёт разбора');
  if (!['burn', 'carry_over', 'to_goal'].includes(input.decision))
    fail('Неизвестное решение');
  let goalId: string | null = null;
  if (input.decision === 'to_goal') {
    goalId = input.goalId ?? null;
    const g = goalId ? d.goals.find((x) => x.id === goalId) : undefined;
    if (!g) fail('Для «в копилку» выберите цель');
    if (g.status === 'archived') fail('Цель архивирована');
  } else if (input.goalId) {
    fail('Цель указывается только для решения «в копилку»');
  }
  const prev = d.closures.find((c) => c.envelopeId === env.id);
  if (prev && (prev.decision !== input.decision || prev.goalId !== goalId)) {
    fail('По этому конверту уже принято другое решение');
  }
  return { envelopeId: env.id, decision: input.decision, goalId };
}

// ---------- colour/icon helpers ----------

export const CATEGORY_COLORS = COLOR_PRESETS;
export const GOAL_COLORS = COLOR_PRESETS;
export function nextSortOrder<T extends { sortOrder: number }>(
  list: T[],
): number {
  return list.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1;
}
