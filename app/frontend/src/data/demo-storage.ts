import { initialData } from './mock';
import type { BudgetData } from '../types';

export const DEMO_STORAGE_KEY = 'savemoney:demo:v1';
type DemoStorage = Pick<Storage, 'getItem' | 'setItem'>;

function isBudgetData(value: unknown): value is BudgetData {
  if (!value || typeof value !== 'object') return false;
  const budget = value as Partial<BudgetData>;
  return [
    budget.categories, budget.incomeSources, budget.obligations, budget.periods,
    budget.envelopes, budget.closures, budget.transactions, budget.goals,
  ].every(Array.isArray);
}

export function loadDemoBudget(storage?: DemoStorage): BudgetData {
  try {
    const saved = JSON.parse((storage ?? window.localStorage).getItem(DEMO_STORAGE_KEY) ?? 'null');
    if (saved?.schemaVersion === 1 && isBudgetData(saved.budget)) return saved.budget;
  } catch {
    // Сбой доступа к хранилищу или устаревшая локальная копия не блокируют запуск демо.
  }
  return structuredClone(initialData);
}

export function saveDemoBudget(storage: DemoStorage | undefined, budget: BudgetData) {
  (storage ?? window.localStorage).setItem(DEMO_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, budget }));
}
