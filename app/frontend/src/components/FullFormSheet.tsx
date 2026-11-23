import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Target,
  Wallet,
} from 'lucide-react';
import { Sheet } from './Sheet';
import { Numpad } from './Numpad';
import { CategoryIcon } from './CategoryIcon';
import { useBudget } from '../store';
import {
  activePeriod,
  categoryById,
  childrenOf,
  dashboard,
  goalSaved,
} from '../lib/budget';
import { TODAY } from '../data/mock';
import { formatMoney } from '../lib/money';
import { toISO, addDays, parseDate } from '../lib/dates';
import { inputCls } from './ui';
import type { Category, Goal, Transaction, TransactionType } from '../types';

export interface TxPreset {
  type?: TransactionType;
  categoryId?: string | null;
  goalId?: string | null;
  incomeSourceId?: string | null;
  obligationId?: string | null;
  amount?: number; // копейки
  date?: string;
  comment?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  preset?: TxPreset | null;
  /** если задан — режим редактирования существующей операции */
  tx?: Transaction | null;
}

const TYPES: {
  value: TransactionType;
  label: string;
  icon: typeof ArrowUpRight;
  active: string;
  idle: string;
}[] = [
  {
    value: 'expense',
    label: 'Трата',
    icon: ArrowUpRight,
    active: 'bg-red-500',
    idle: 'text-red-500',
  },
  {
    value: 'income',
    label: 'Доход',
    icon: ArrowDownLeft,
    active: 'bg-emerald-500',
    idle: 'text-emerald-500',
  },
  {
    value: 'goal_deposit',
    label: 'В цель',
    icon: Target,
    active: 'bg-sky-500',
    idle: 'text-sky-500',
  },
  {
    value: 'goal_withdrawal',
    label: 'Из цели',
    icon: Wallet,
    active: 'bg-amber-500',
    idle: 'text-amber-500',
  },
];

const EMPTY: Required<Omit<TxPreset, never>> = {
  type: 'expense',
  categoryId: null,
  goalId: null,
  incomeSourceId: null,
  obligationId: null,
  amount: 0,
  date: TODAY,
  comment: '',
};

export function FullFormSheet({ open, onClose, preset, tx }: Props) {
  const { data, addTransaction, updateTransaction } = useBudget();

  const [type, setType] = useState<TransactionType>('expense');
  const [amountKop, setAmountKop] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [incomeSourceId, setIncomeSourceId] = useState<string | null>(null);
  const [obligationId, setObligationId] = useState<string | null>(null);
  const [date, setDate] = useState(TODAY);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);
  const [picker, setPicker] = useState<
    'category' | 'goal' | 'source' | 'obligation' | null
  >(null);
  const [error, setError] = useState('');

  const editing = !!tx;
  const seedKey = useRef('');

  useEffect(() => {
    if (!open) return;
    const key = tx ? `tx:${tx.id}` : `new:${JSON.stringify(preset ?? {})}`;
    if (seedKey.current === key) return;
    seedKey.current = key;
    const base = tx
      ? {
          type: tx.type,
          categoryId: tx.categoryId,
          goalId: tx.goalId,
          incomeSourceId: tx.incomeSourceId,
          obligationId: tx.obligationId,
          amount: tx.amount,
          date: tx.date,
          comment: tx.comment,
        }
      : { ...EMPTY, ...(preset ?? {}) };
    setType(base.type);
    setAmountKop(base.amount ?? 0);
    setCategoryId(base.categoryId ?? null);
    setGoalId(base.goalId ?? null);
    setIncomeSourceId(base.incomeSourceId ?? null);
    setObligationId(base.obligationId ?? null);
    setDate(base.date || TODAY);
    setComment(base.comment ?? '');
    setDone(false);
    setPicker(null);
    setError('');
  }, [open, tx, preset]);

  const period = activePeriod(data);
  const dash = period ? dashboard(data, period.id, TODAY) : null;

  // Группы категорий нужного вида (верхний уровень + подкатегории)
  const categoryGroups = useMemo(() => {
    const kind = type === 'income' ? 'income' : 'expense';
    return data.categories
      .filter((c) => c.kind === kind && c.parentId === null && !c.isArchived)
      .map((top) => ({ top, children: childrenOf(data, top.id) }));
  }, [data, type]);

  const goals = data.goals.filter((g) => g.status === 'active');
  const sources = data.incomeSources.filter((s) => s.isActive);
  const obligations = data.obligations.filter((o) => o.isActive);

  const selectedCat = categoryById(data, categoryId);
  const selectedGoal =
    goals.find((g) => g.id === goalId) ??
    data.goals.find((g) => g.id === goalId);
  const goalSavedNow = goalId ? goalSaved(data, goalId) : 0;

  const sign = type === 'income' || type === 'goal_withdrawal' ? 1 : -1;
  const afterAvailable = dash ? dash.available + sign * amountKop : 0;

  const onKey = (key: string) => {
    if (key === 'del') {
      setAmountKop((v) => Math.floor(v / 10));
      return;
    }
    setAmountKop((v) => {
      const next = key === '00' ? v * 100 : v * 10 + parseInt(key, 10);
      return next > 999_999_999_999 ? v : next;
    });
  };

  const shiftDate = (days: number) =>
    setDate(toISO(addDays(parseDate(date), days)));

  const validate = (): string => {
    if (amountKop <= 0) return 'Введите сумму';
    if ((type === 'expense' || type === 'income') && !categoryId)
      return 'Выберите категорию';
    if ((type === 'goal_deposit' || type === 'goal_withdrawal') && !goalId)
      return 'Выберите цель';
    if (type === 'goal_withdrawal' && amountKop > goalSavedNow) {
      return `На цели накоплено ${formatMoney(goalSavedNow)} — снять больше нельзя`;
    }
    return '';
  };

  const submit = () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    const payload = {
      type,
      amount: amountKop,
      date,
      categoryId: type === 'expense' || type === 'income' ? categoryId : null,
      goalId:
        type === 'goal_deposit' || type === 'goal_withdrawal' ? goalId : null,
      incomeSourceId: type === 'income' ? incomeSourceId : null,
      obligationId: type === 'expense' ? obligationId : null,
      comment,
    };
    const ok = tx ? updateTransaction(tx.id, payload) : addTransaction(payload);
    if (ok) {
      setDone(true);
      setTimeout(onClose, 420);
    }
  };

  const needsCategory = type === 'expense' || type === 'income';
  const needsGoal = type === 'goal_deposit' || type === 'goal_withdrawal';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Изменить операцию' : 'Новая операция'}
    >
      {/* Переключатель типа */}
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1 ">
        {TYPES.map(({ value, label, icon: Icon, active, idle }) => (
          <button
            key={value}
            disabled={editing}
            onClick={() => {
              setType(value);
              setCategoryId(null);
              setGoalId(null);
              setIncomeSourceId(null);
              setObligationId(null);
              setError('');
            }}
            className={`relative flex flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-bold transition disabled:opacity-60 ${
              type === value ? 'text-white' : 'text-slate-500 '
            }`}
          >
            {type === value && (
              <motion.span
                layoutId="tx-type-pill"
                className={`absolute inset-0 rounded-xl ${active}`}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex flex-col items-center gap-0.5">
              <Icon size={16} className={type === value ? '' : idle} />
              {label}
            </span>
          </button>
        ))}
      </div>
      {editing && (
        <p className="mb-3 text-center text-[11px] text-slate-400">
          Тип операции после создания менять нельзя
        </p>
      )}

      <Numpad valueKopecks={amountKop} onKey={onKey} />

      {/* Связи */}
      <div className="mt-4 space-y-2">
        {needsCategory && (
          <SelectRow
            icon={
              selectedCat ? (
                <CategoryIcon category={selectedCat} size={15} />
              ) : (
                <FolderIcon />
              )
            }
            label={selectedCat?.name ?? 'Категория'}
            sub={
              selectedCat && selectedCat.parentId
                ? categoryById(data, selectedCat.parentId)?.name
                : undefined
            }
            open={picker === 'category'}
            onToggle={() =>
              setPicker(picker === 'category' ? null : 'category')
            }
          />
        )}
        {needsGoal && (
          <SelectRow
            icon={
              selectedGoal ? (
                <CategoryIcon
                  icon={selectedGoal.icon}
                  color={selectedGoal.color}
                  size={15}
                />
              ) : (
                <Target size={16} className="text-slate-400" />
              )
            }
            label={selectedGoal?.name ?? 'Цель'}
            sub={
              selectedGoal
                ? `накоплено ${formatMoney(goalSaved(data, selectedGoal.id, date))}`
                : undefined
            }
            open={picker === 'goal'}
            onToggle={() => setPicker(picker === 'goal' ? null : 'goal')}
          />
        )}
        {type === 'income' && (
          <SelectRow
            icon={<Wallet size={16} className="text-slate-400" />}
            label={
              data.incomeSources.find((s) => s.id === incomeSourceId)?.name ??
              'Источник дохода (необязательно)'
            }
            open={picker === 'source'}
            onToggle={() => setPicker(picker === 'source' ? null : 'source')}
          />
        )}
        {type === 'expense' && (
          <SelectRow
            icon={<ReceiptIcon />}
            label={
              data.obligations.find((o) => o.id === obligationId)?.name ??
              'Обязательство (необязательно)'
            }
            open={picker === 'obligation'}
            onToggle={() =>
              setPicker(picker === 'obligation' ? null : 'obligation')
            }
          />
        )}
      </div>

      {/* Выпадающие списки */}
      <AnimateHeight open={picker === 'category' && needsCategory}>
        <div className="no-scrollbar mt-2 max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-slate-50 p-1.5 ring-1 ring-slate-100 ">
          {categoryGroups.map(({ top, children }) => (
            <div key={top.id}>
              <PickButton
                active={categoryId === top.id}
                onClick={() => {
                  setCategoryId(top.id);
                  setPicker(null);
                  setError('');
                }}
              >
                <CategoryIcon category={top} size={14} />
                <span className="flex-1 truncate">{top.name}</span>
              </PickButton>
              {children.map((ch: Category) => (
                <PickButton
                  key={ch.id}
                  active={categoryId === ch.id}
                  indent
                  onClick={() => {
                    setCategoryId(ch.id);
                    setPicker(null);
                    setError('');
                  }}
                >
                  <CategoryIcon category={ch} size={14} />
                  <span className="flex-1 truncate">{ch.name}</span>
                </PickButton>
              ))}
            </div>
          ))}
        </div>
      </AnimateHeight>

      <AnimateHeight open={picker === 'goal' && needsGoal}>
        <div className="no-scrollbar mt-2 max-h-56 space-y-1 overflow-y-auto rounded-2xl bg-slate-50 p-1.5 ring-1 ring-slate-100 ">
          {goals.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">
              Нет активных целей — создайте в разделе «Цели»
            </p>
          )}
          {goals.map((g: Goal) => (
            <PickButton
              key={g.id}
              active={goalId === g.id}
              onClick={() => {
                setGoalId(g.id);
                setPicker(null);
                setError('');
              }}
            >
              <CategoryIcon icon={g.icon} color={g.color} size={14} />
              <span className="flex-1 truncate">{g.name}</span>
              <span className="text-[11px] text-slate-400">
                {formatMoney(goalSaved(data, g.id, date))}
              </span>
            </PickButton>
          ))}
        </div>
      </AnimateHeight>

      <AnimateHeight open={picker === 'source' && type === 'income'}>
        <div className="mt-2 space-y-1 rounded-2xl bg-slate-50 p-1.5 ring-1 ring-slate-100 ">
          <PickButton
            active={incomeSourceId === null}
            onClick={() => {
              setIncomeSourceId(null);
              setPicker(null);
            }}
          >
            <span className="flex-1 text-slate-400">Без источника</span>
          </PickButton>
          {sources.map((s) => (
            <PickButton
              key={s.id}
              active={incomeSourceId === s.id}
              onClick={() => {
                setIncomeSourceId(s.id);
                setPicker(null);
              }}
            >
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-[11px] text-slate-400">
                {formatMoney(s.amount)}
              </span>
            </PickButton>
          ))}
        </div>
      </AnimateHeight>

      <AnimateHeight open={picker === 'obligation' && type === 'expense'}>
        <div className="mt-2 space-y-1 rounded-2xl bg-slate-50 p-1.5 ring-1 ring-slate-100 ">
          <PickButton
            active={obligationId === null}
            onClick={() => {
              setObligationId(null);
              setPicker(null);
            }}
          >
            <span className="flex-1 text-slate-400">Без обязательства</span>
          </PickButton>
          {obligations.map((o) => (
            <PickButton
              key={o.id}
              active={obligationId === o.id}
              onClick={() => {
                setObligationId(o.id);
                setPicker(null);
              }}
            >
              <span className="flex-1 truncate">{o.name}</span>
              <span className="text-[11px] text-slate-400">
                {formatMoney(o.amount)}
              </span>
            </PickButton>
          ))}
        </div>
      </AnimateHeight>

      {/* Дата */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => shiftDate(-1)}
          className="rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 "
        >
          ←
        </button>
        <div className="relative flex-1">
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className={`${inputCls} text-center tabular-nums`}
          />
        </div>
        <button
          onClick={() => shiftDate(1)}
          className="rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 "
        >
          →
        </button>
      </div>

      <input
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 500))}
        placeholder="Комментарий (до 500 символов)"
        className="mt-3 w-full rounded-xl bg-slate-100 px-4 py-3 text-[15px] outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-400 "
      />

      {dash && (
        <div className="mt-3 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-500 ring-1 ring-slate-100 ">
          Свободно после операции:{' '}
          <motion.span
            key={afterAvailable}
            initial={{ scale: 1.06 }}
            animate={{ scale: 1 }}
            className={`font-bold tabular-nums ${afterAvailable < 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
          >
            {formatMoney(afterAvailable)}
          </motion.span>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-600 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20">
          {error}
        </p>
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={submit}
        disabled={amountKop <= 0 || done}
        className={`mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-lg transition
 ${
   type === 'expense'
     ? 'bg-red-500 shadow-red-500/25 hover:bg-red-600'
     : type === 'income'
       ? 'bg-emerald-500 shadow-emerald-500/25 hover:bg-emerald-600'
       : type === 'goal_deposit'
         ? 'bg-sky-500 shadow-sky-500/25 hover:bg-sky-600'
         : 'bg-amber-500 shadow-amber-500/25 hover:bg-amber-600'
 }
 disabled:opacity-40`}
      >
        {done ? <Check size={18} /> : null}
        {done ? 'Готово' : editing ? 'Сохранить' : 'Добавить'}
      </motion.button>
    </Sheet>
  );
}

function AnimateHeight({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      {open && <div className="pt-0.5">{children}</div>}
    </motion.div>
  );
}

function SelectRow({
  icon,
  label,
  sub,
  open,
  onToggle,
}: {
  icon: ReactNode;
  label: string;
  sub?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-left transition hover:bg-slate-200/70 "
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-slate-900 ">
          {label}
        </span>
        {sub && (
          <span className="block truncate text-xs text-slate-400 ">{sub}</span>
        )}
      </span>
      <ChevronDown
        size={16}
        className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

function PickButton({
  active,
  onClick,
  children,
  indent,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium transition
 ${active ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30' : 'text-slate-700 hover:bg-white '}
 ${indent ? 'pl-8' : ''}`}
    >
      {children}
    </button>
  );
}

function FolderIcon() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200/70 text-slate-500 ">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </svg>
    </span>
  );
}
function ReceiptIcon() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200/70 text-slate-500 ">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
        <path d="M8 7h8M8 11h8M8 15h5" />
      </svg>
    </span>
  );
}
