import { describe, expect, it } from 'vitest';
import { initialData } from '../data/mock';
import {
  ValidationError,
  validateCategoryInput,
  validateGoalInput,
  validateTransactionInput,
  validateIncomeSourceInput,
  validateObligationInput,
  validateEnvelopeLimit,
  categoryDeletable,
  goalSeriesStaysPositive,
  goalUsedByTransactions,
  envelopeCategoryOk,
} from './validate';
import type { BudgetData, Transaction } from '../types';

const d = (): BudgetData => structuredClone(initialData);

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1',
  type: 'expense',
  amount: 100,
  date: '2026-11-20',
  categoryId: null,
  periodId: '2026-11',
  goalId: null,
  incomeSourceId: null,
  obligationId: null,
  comment: '',
  createdAt: 0,
  deletedAt: null,
  ...over,
});

describe('validateTransactionInput', () => {
  it('принимает корректную трату', () => {
    const data = d();
    const cat = data.categories.find(
      (c) => c.kind === 'expense' && c.parentId === null,
    )!;
    const v = validateTransactionInput(data, {
      type: 'expense',
      amount: 50000,
      date: '2026-11-20',
      categoryId: cat.id,
    });
    expect(v.amount).toBe(50000);
    expect(v.periodId).toBe('2026-11');
  });

  it('отклоняет трату без категории и с категорией не того типа', () => {
    const data = d();
    const inc = data.categories.find((c) => c.kind === 'income')!;
    expect(() =>
      validateTransactionInput(data, {
        type: 'expense',
        amount: 100,
        date: '2026-11-20',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateTransactionInput(data, {
        type: 'expense',
        amount: 100,
        date: '2026-11-20',
        categoryId: inc.id,
      }),
    ).toThrow(/расход/);
  });

  it('отклоняет снятие с цели больше накопленного', () => {
    const data = d();
    const goal = data.goals.find((g) => g.status === 'active')!;
    // кладём крупный deposit, затем пробуем снять больше
    const dep = tx({
      id: 'dep',
      type: 'goal_deposit',
      amount: 100000,
      goalId: goal.id,
      date: '2026-11-01',
    });
    data.transactions.push(dep);
    // на цели уже ~15 000 ₽ + 1 000 ₽ — снимаем 20 000 ₽
    expect(() =>
      validateTransactionInput(data, {
        type: 'goal_withdrawal',
        amount: 2000000,
        date: '2026-11-20',
        goalId: goal.id,
      }),
    ).toThrow(/отрицательн/);
    expect(() =>
      validateTransactionInput(data, {
        type: 'goal_withdrawal',
        amount: 500000,
        date: '2026-11-20',
        goalId: goal.id,
      }),
    ).not.toThrow();
  });

  it('отклоняет операцию в несуществующий период и доход с чужим полем', () => {
    const data = d();
    const cat = data.categories.find((c) => c.kind === 'income')!;
    expect(() =>
      validateTransactionInput(data, {
        type: 'income',
        amount: 100,
        date: '2030-01-01',
        categoryId: cat.id,
      }),
    ).toThrow(/Период/);
    expect(() =>
      validateTransactionInput(data, {
        type: 'income',
        amount: 100,
        date: '2026-11-20',
        categoryId: cat.id,
        obligationId: 'x',
      }),
    ).toThrow(/Обязательство/);
  });
});

describe('категории', () => {
  it('не даёт третьего уровня вложенности и дубликаты', () => {
    const data = d();
    const top = data.categories.find(
      (c) => c.kind === 'expense' && c.parentId === null && !c.isArchived,
    )!;
    const child = { ...top, id: 'ch1', parentId: top.id, name: 'Подкатегория' };
    data.categories.push(child);
    expect(() =>
      validateCategoryInput(data, {
        name: 'Внучка',
        kind: 'expense',
        parentId: 'ch1',
      }),
    ).toThrow(/двух уровней/);
    expect(() =>
      validateCategoryInput(data, {
        name: top.name,
        kind: 'expense',
        parentId: null,
      }),
    ).toThrow(/уже есть/);
  });

  it('запрещает удалять категорию с операциями и конвертом', () => {
    const data = d();
    const used = data.transactions.find((t) => t.categoryId && !t.deletedAt)!;
    expect(() => categoryDeletable(data, used.categoryId!)).toThrow(
      /операциях|конверт/,
    );
    const envCat = data.envelopes[0].categoryId;
    expect(() => categoryDepletGuard(data, envCat)).toThrow();
  });
});

function categoryDepletGuard(data: BudgetData, id: string) {
  return categoryDeletable(data, id);
}

describe('цели', () => {
  it('запрещает удалить цель с операциями, разрешает пустую', () => {
    const data = d();
    const withTx = data.goals.find((g) => goalUsedByTransactions(data, g.id))!;
    expect(goalUsedByTransactions(data, withTx.id)).toBe(true);
    const empty: BudgetData = {
      ...data,
      goals: [
        ...data.goals,
        {
          id: 'g-empty',
          name: 'Пустая',
          targetAmount: 1000,
          targetDate: null,
          icon: '',
          color: '#34a06a',
          status: 'active',
          sortOrder: 99,
        },
      ],
    };
    expect(goalUsedByTransactions(empty, 'g-empty')).toBe(false);
    expect(goalSeriesStaysPositive(data, withTx.id)).toBe(true);
  });

  it('валидирует имя и сумму цели', () => {
    const data = d();
    expect(() =>
      validateGoalInput(data, { name: '  ', targetAmount: 100 }),
    ).toThrow(/Название/);
    expect(() =>
      validateGoalInput(data, { name: 'X', targetAmount: 0 }),
    ).toThrow(/положительной/);
    expect(
      validateGoalInput(data, { name: 'Новая', targetAmount: 50000 }).n,
    ).toBe('Новая');
  });
});

describe('источники и обязательства', () => {
  it('требует день месяца для monthly_day и запрещает для irregular', () => {
    const data = d();
    expect(() =>
      validateIncomeSourceInput(data, {
        name: 'X',
        amount: 100,
        schedule: 'monthly_day',
        dayOfMonth: null,
      }),
    ).toThrow(/день месяца/);
    expect(() =>
      validateIncomeSourceInput(data, {
        name: 'Y',
        amount: 100,
        schedule: 'irregular',
        dayOfMonth: 5,
      }),
    ).toThrow(/только для графика/);
    expect(
      validateObligationInput(data, {
        name: 'Новое обязательство',
        amount: 100,
        dayOfMonth: 5,
      }).day,
    ).toBe(5);
  });

  it('лимит конверта — целые копейки ≥ 0', () => {
    expect(validateEnvelopeLimit(0)).toBe(0);
    expect(() => validateEnvelopeLimit(-1)).toThrow(ValidationError);
    expect(() => validateEnvelopeLimit(10.5)).toThrow(ValidationError);
    const data = d();
    const incomeCat = data.categories.find((c) => c.kind === 'income')!;
    expect(() => envelopeCategoryOk(data, incomeCat.id)).toThrow(/расходной/);
    const child = data.categories.find((c) => c.parentId !== null)!;
    if (child)
      expect(() => envelopeCategoryOk(data, child.id)).toThrow(
        /верхнего уровня/,
      );
  });
});
