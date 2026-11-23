import { createContext, useCallback, useContext, useState, useRef } from 'react';
import type { BudgetOverview } from './api/budget';
import type {
  BudgetData, Category, ClosureDecision, Goal, IncomeSource, Obligation, TransactionType,
} from './types';

export interface NewTransaction {
  type: TransactionType;
  amount: number;
  date: string;
  categoryId?: string | null;
  goalId?: string | null;
  incomeSourceId?: string | null;
  obligationId?: string | null;
  comment?: string;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'success';
}

export type MutationResult = boolean | Promise<boolean>;
export type ClosureDraft = Record<string, { decision: ClosureDecision; goalId: string | null }>;

export interface BudgetContextValue {
  data: BudgetData;
  overview?: BudgetOverview;
  busy: boolean;
  addTransaction: (t: NewTransaction) => MutationResult;
  updateTransaction: (id: string, t: NewTransaction) => MutationResult;
  deleteTransaction: (id: string) => MutationResult;
  restoreTransaction: (id: string) => MutationResult;
  createCategory: (input: Partial<Category>) => MutationResult;
  updateCategory: (id: string, patch: Partial<Category>) => MutationResult;
  deleteCategory: (id: string) => MutationResult;
  upsertIncomeSource: (input: Partial<IncomeSource>, id?: string) => MutationResult;
  deleteIncomeSource: (id: string) => MutationResult;
  upsertObligation: (input: Partial<Obligation>, id?: string) => MutationResult;
  deleteObligation: (id: string) => MutationResult;
  upsertGoal: (input: Partial<Goal>, id?: string) => MutationResult;
  deleteGoal: (id: string) => MutationResult;
  setEnvelopeLimit: (
    categoryId: string,
    limitAmount: number,
    periodId?: string,
  ) => MutationResult;
  createPeriodsUpTo: (date: string) => MutationResult;
  applyClosures: (draft: ClosureDraft) => MutationResult;
  exportSnapshot: () => string;
  importSnapshot: (json: string) => MutationResult;
  resetData: () => MutationResult;
}

export const BudgetContext = createContext<BudgetContextValue | null>(null);
export const ToastContext = createContext<{
  toasts: Toast[];
  dismiss: (id: number) => void;
  push: (text: string, kind?: Toast['kind']) => void;
} | null>(null);

export function useBudgetToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const push = useCallback((text: string, kind: Toast['kind'] = 'error') => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    window.setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === 'error' ? 5000 : 2200,
    );
  }, []);
  const dismiss = useCallback(
    (id: number) => setToasts((t) => t.filter((x) => x.id !== id)),
    [],
  );

  return { toasts, dismiss, push };
}

export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget outside provider');
  return ctx;
}

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts outside provider');
  return ctx;
}
