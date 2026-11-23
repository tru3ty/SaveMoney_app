import { expect, it } from 'vitest';
import { CURRENT_PERIOD, initialData } from '../data/mock';
import { childrenOf, periodTotalExpense, spentFor } from './budget';

it('оставляет исторические расходы в бюджете после архивации категорий', () => {
  const data = structuredClone(initialData);
  const foodSpent = spentFor(data, 'food', CURRENT_PERIOD);
  const total = periodTotalExpense(data, CURRENT_PERIOD);
  data.categories = data.categories.map((category) => (
    ['food', 'groceries', 'cafe'].includes(category.id) ? { ...category, isArchived: true } : category
  ));
  expect(foodSpent).toBeGreaterThan(0);
  expect(childrenOf(data, 'food')).toEqual([]);
  expect(spentFor(data, 'food', CURRENT_PERIOD)).toBe(foodSpent);
  expect(periodTotalExpense(data, CURRENT_PERIOD)).toBe(total);
});
