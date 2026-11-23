export type Kopecks = number;

export type TransactionType =
  'expense' | 'income' | 'goal_deposit' | 'goal_withdrawal';
export type PeriodStatus = 'active' | 'pending_review' | 'closed';
export type EnvelopeStatus = 'ok' | 'warning' | 'over';
export type ClosureDecision = 'burn' | 'carry_over' | 'to_goal';
export type GoalStatus = 'active' | 'completed' | 'archived';
export type IncomeSchedule = 'monthly_day' | 'monthly_last_day' | 'irregular';

export interface Category {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  parentId: string | null;
  icon: string;
  color: string;
  isArchived: boolean;
  sortOrder: number;
}

export interface IncomeSource {
  id: string;
  name: string;
  amount: Kopecks;
  schedule: IncomeSchedule;
  dayOfMonth: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface Obligation {
  id: string;
  name: string;
  amount: Kopecks;
  dayOfMonth: number;
  categoryId: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface Period {
  id: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
}

export interface Envelope {
  id: string;
  periodId: string;
  categoryId: string;
  limitAmount: Kopecks;
  carryOverAmount: Kopecks;
}

export interface PeriodClosure {
  envelopeId: string;
  decision: ClosureDecision;
  leftoverAmount: Kopecks;
  goalId: string | null;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: Kopecks;
  date: string;
  categoryId: string | null;
  periodId: string;
  goalId: string | null;
  incomeSourceId: string | null;
  obligationId: string | null;
  comment: string;
  createdAt: number;
  deletedAt: number | null;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: Kopecks;
  targetDate: string | null;
  icon: string;
  color: string;
  status: GoalStatus;
  sortOrder: number;
}

export interface EnvelopeView extends Envelope {
  spent: Kopecks;
  remaining: Kopecks;
  status: EnvelopeStatus;
}

export interface BudgetData {
  categories: Category[];
  incomeSources: IncomeSource[];
  obligations: Obligation[];
  periods: Period[];
  envelopes: Envelope[];
  closures: PeriodClosure[];
  transactions: Transaction[];
  goals: Goal[];
}
