import type { BudgetData } from '../types';
import type { ClosureDraft } from '../budget-context';
import { addDays, parseDate, toISO } from '../lib/dates';
import { pendingReviewPeriod, spentFor } from '../lib/budget';
import { validateClosureInput } from '../lib/validate';

export function planClosures(data: BudgetData, draft: ClosureDraft) {
  const period = pendingReviewPeriod(data);
  if (!period) throw new Error('Нет периода, ожидающего разбора');

  const envelopes = data.envelopes.filter((item) => item.periodId === period.id);
  const closed = new Map(data.closures.map((item) => [item.envelopeId, item]));
  const nextMonth = toISO(addDays(parseDate(period.endDate), 1)).slice(0, 7);
  const categories = new Map(data.categories.map((item) => [item.id, item]));
  const distributed = new Set(envelopes
    .filter((item) => closed.has(item.id) && closed.get(item.id)?.decision !== 'burn')
    .map((item) => item.categoryId));

  const decisions = envelopes.filter((item) => !closed.has(item.id)).map((item) => {
    const selected = draft[item.id];
    if (!selected) throw new Error('Выберите решение для каждого оставшегося конверта');
    const decision = validateClosureInput(data, { envelopeId: item.id, ...selected });
    if (decision.decision === 'burn') return decision;

    const parent = categories.get(item.categoryId)?.parentId;
    if ([...distributed].some((id) => id === parent || categories.get(id)?.parentId === item.categoryId)) {
      throw new Error('Остатки пересекающихся конвертов нельзя распределить дважды');
    }
    distributed.add(item.categoryId);

    const remaining = item.limitAmount + item.carryOverAmount - spentFor(data, item.categoryId, period.id);
    if (decision.decision === 'carry_over') {
      const target = data.envelopes.find((next) => next.periodId === nextMonth && next.categoryId === item.categoryId);
      if (!target) throw new Error('В следующем периоде нет конверта для переноса');
      if (!Number.isSafeInteger(target.carryOverAmount + remaining)) throw new Error('Сумма переноса слишком велика');
    } else {
      const next = data.periods.find((candidate) => candidate.id === nextMonth);
      if (remaining <= 0) throw new Error('Перевести в цель можно только положительный остаток');
      if (!next || next.status === 'closed' || data.envelopes.some((candidate) =>
        candidate.periodId === nextMonth && closed.has(candidate.id))) {
        throw new Error('В следующем периоде операции заморожены или период ещё не открыт');
      }
      const transactionIds = [`closure:${item.id}`, `closure:${period.id}:${item.categoryId}`];
      if (data.transactions.some((transaction) => transactionIds.includes(transaction.id))) {
        throw new Error('Операция перевода уже существует');
      }
    }

    return decision;
  });
  if (!decisions.length) throw new Error('Решения по этому периоду уже приняты');
  return { periodId: period.id, decisions };
}
