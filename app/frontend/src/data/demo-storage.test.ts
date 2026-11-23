import { describe, expect, it } from 'vitest';
import { initialData } from './mock';
import { loadDemoBudget, saveDemoBudget } from './demo-storage';

const browser = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
};

describe('демобюджет', () => {
  it('восстанавливает изменения в том же браузере и оставляет второго посетителя на демоданных', () => {
    const first = browser();
    const second = browser();
    const budget = loadDemoBudget(first);
    budget.transactions = [];
    saveDemoBudget(first, budget);
    expect(loadDemoBudget(first).transactions).toEqual([]);
    expect(loadDemoBudget(second).transactions).toEqual(initialData.transactions);
  });

  it('открывается даже после повреждения локальной копии', () => {
    const storage = { ...browser(), getItem: () => '{"schemaVersion":1,"budget":null}' };
    expect(loadDemoBudget(storage)).toEqual(initialData);
    expect(loadDemoBudget(storage)).not.toBe(initialData);
  });
});
