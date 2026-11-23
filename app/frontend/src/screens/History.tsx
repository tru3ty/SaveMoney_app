import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Target,
  Trash2,
  RotateCcw,
  X,
  Pencil,
} from 'lucide-react';
import { useBudget } from '../store';
import { categoryById, isLive } from '../lib/budget';
import { formatDate, weekdayShort, isWeekend } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { CategoryIcon } from '../components/CategoryIcon';
import { Sheet } from '../components/Sheet';
import type { Transaction, TransactionType } from '../types';

type Filter = 'all' | 'expense' | 'income' | 'goals';

const TYPE_META: Record<
  TransactionType,
  { label: string; icon: typeof ArrowUpRight; color: string }
> = {
  expense: { label: 'Трата', icon: ArrowUpRight, color: 'text-red-500' },
  income: { label: 'Доход', icon: ArrowDownLeft, color: 'text-emerald-500' },
  goal_deposit: { label: 'В копилку', icon: Target, color: 'text-sky-500' },
  goal_withdrawal: {
    label: 'Из копилки',
    icon: Target,
    color: 'text-amber-500',
  },
};

function txTitle(
  data: ReturnType<typeof useBudget>['data'],
  t: Transaction,
): string {
  if (t.type === 'goal_deposit' || t.type === 'goal_withdrawal') {
    return data.goals.find((g) => g.id === t.goalId)?.name ?? 'Цель';
  }
  if (t.obligationId) {
    return (
      data.obligations.find((o) => o.id === t.obligationId)?.name ?? 'Платёж'
    );
  }
  return categoryById(data, t.categoryId)?.name ?? 'Операция';
}

interface Props {
  onEditTx?: (tx: Transaction) => void;
}

export function History({ onEditTx }: Props) {
  const { data, deleteTransaction, restoreTransaction } = useBudget();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.transactions
      .filter((t) => showDeleted || isLive(t))
      .filter((t) => {
        if (filter === 'expense' && t.type !== 'expense') return false;
        if (filter === 'income' && t.type !== 'income') return false;
        if (filter === 'goals' && !t.type.startsWith('goal_')) return false;
        if (
          q &&
          !t.comment.toLowerCase().includes(q) &&
          !txTitle(data, t).toLowerCase().includes(q)
        )
          return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

    const map = new Map<string, Transaction[]>();
    for (const t of list) {
      const arr = map.get(t.date) ?? [];
      arr.push(t);
      map.set(t.date, arr);
    }
    return [...map.entries()];
  }, [data, query, filter, showDeleted]);

  const deletedCount = useMemo(
    () => data.transactions.filter((t) => t.deletedAt !== null).length,
    [data],
  );

  const dayTotal = (txs: Transaction[]) =>
    txs.reduce(
      (s, t) =>
        s +
        (t.type === 'income' || t.type === 'goal_withdrawal'
          ? t.amount
          : -t.amount),
      0,
    );

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-28">
      <div className="sticky top-0 z-10 bg-slate-50/90 px-4 pb-2 pt-4 backdrop-blur">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          История
        </h1>
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-400">
          <Search size={17} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по комментарию"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-slate-400"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400">
              <X size={15} />
            </button>
          )}
        </div>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ['all', 'Все'],
              ['expense', 'Траты'],
              ['income', 'Доходы'],
              ['goals', 'Цели'],
            ] as [Filter, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                filter === v
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {deletedCount > 0 && (
          <button
            onClick={() => setShowDeleted((v) => !v)}
            className={`mt-2 text-xs font-semibold transition ${showDeleted ? 'text-red-500' : 'text-slate-400 hover:text-slate-600 '}`}
          >
            {showDeleted
              ? 'Скрыть удалённые'
              : `Показать удалённые (${deletedCount})`}
          </button>
        )}
      </div>

      <div className="px-4 pt-2">
        {groups.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">
            Ничего не найдено
          </div>
        )}
        {groups.map(([date, txs]) => {
          const total = dayTotal(txs);
          const weekend = isWeekend(date);
          return (
            <div key={date} className="mb-4">
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <span
                  className={`text-[13px] font-bold ${weekend ? 'text-red-400' : 'text-slate-400'}`}
                >
                  {formatDate(date)} · {weekdayShort(date)}
                </span>
                <span
                  className={`text-xs font-semibold tabular-nums ${total >= 0 ? 'text-emerald-600' : 'text-slate-500'}`}
                >
                  {total === 0 ? '—' : formatMoney(total, { sign: true })}
                </span>
              </div>
              <div className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {txs.map((t) => {
                    const meta = TYPE_META[t.type];
                    const Icon = meta.icon;
                    const cat = t.goalId
                      ? data.goals.find((g) => g.id === t.goalId)
                      : categoryById(data, t.categoryId);
                    const positive =
                      t.type === 'income' || t.type === 'goal_withdrawal';
                    const deleted = t.deletedAt !== null;
                    return (
                      <motion.button
                        key={t.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: deleted ? 0.45 : 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelected(t)}
                        className={`flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50 ${deleted ? 'opacity-60' : ''}`}
                      >
                        {cat ? (
                          <CategoryIcon
                            icon={cat.icon}
                            color={cat.color}
                            size={16}
                          />
                        ) : (
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-full ${positive ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-400'}`}
                          >
                            <Icon size={16} />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className={`truncate text-[15px] font-semibold text-slate-900 ${deleted ? 'line-through' : ''}`}
                          >
                            {txTitle(data, t)}
                            {deleted && (
                              <span className="ml-1.5 text-[10px] font-bold uppercase text-red-400">
                                удалена
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-slate-400">
                            {t.comment || meta.label}
                          </div>
                        </div>
                        <span
                          className={`text-[15px] font-bold tabular-nums ${positive ? 'text-emerald-600' : 'text-slate-900'}`}
                        >
                          {positive ? '+' : '−'}
                          {formatMoney(t.amount)}
                        </span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>

      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Операция"
      >
        {selected && (
          <TxDetail
            tx={selected}
            onDelete={async () => {
              if (await deleteTransaction(selected.id)) setSelected(null);
            }}
            onRestore={async () => {
              if (await restoreTransaction(selected.id)) setSelected(null);
            }}
            onEdit={
              onEditTx
                ? () => {
                    const tx = selected;
                    setSelected(null);
                    onEditTx(tx);
                  }
                : undefined
            }
            onCloseDetail={() => setSelected(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function TxDetail({
  tx,
  onDelete,
  onRestore,
  onEdit,
  onCloseDetail,
}: {
  tx: Transaction;
  onDelete: () => void;
  onRestore: () => void;
  onEdit?: () => void;
  onCloseDetail: () => void;
}) {
  const { data } = useBudget();
  const deleted = tx.deletedAt !== null;
  const positive = tx.type === 'income' || tx.type === 'goal_withdrawal';
  return (
    <div>
      <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
        <div>
          <div className="text-sm text-slate-400">{txTitle(data, tx)}</div>
          <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
            {positive ? '+' : '−'}
            {formatMoney(tx.amount)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {formatDate(tx.date)}
            {tx.comment ? ` · ${tx.comment}` : ''}
          </div>
        </div>
        {deleted && (
          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-500">
            удалена
          </span>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        {deleted ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onRestore}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-white"
          >
            <RotateCcw size={16} /> Восстановить
          </motion.button>
        ) : (
          <>
            {onEdit && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onEdit}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white "
              >
                <Pencil size={16} /> Изменить
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onDelete}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-bold text-red-500 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20"
            >
              <Trash2 size={16} /> Удалить
            </motion.button>
          </>
        )}
        <button
          onClick={onCloseDetail}
          className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-500 "
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
