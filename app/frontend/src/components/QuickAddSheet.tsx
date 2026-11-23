import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Sheet } from './Sheet';
import { Numpad } from './Numpad';
import { useBudget } from '../store';
import { categoryById, spentFor, activePeriod } from '../lib/budget';
import { TODAY } from '../lib/mode';
import { formatMoney } from '../lib/money';
import { CategoryIcon } from './CategoryIcon';
import type { Category } from '../types';

interface Props {
  categoryId: string | null;
  onClose: () => void;
  onMore?: () => void;
}

/** Быстрый ввод траты по конкретному конверту — цель 3 секунды */
export function QuickAddSheet({ categoryId, onClose, onMore }: Props) {
  const { data, busy, addTransaction } = useBudget();
  const [amountKop, setAmountKop] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);

  const cat: Category | undefined = categoryId
    ? categoryById(data, categoryId)
    : undefined;
  const period = activePeriod(data);
  const env = period
    ? data.envelopes.find(
        (e) => e.periodId === period.id && e.categoryId === categoryId,
      )
    : undefined;
  const budget = env ? env.limitAmount + env.carryOverAmount : 0;
  const spent =
    period && categoryId ? spentFor(data, categoryId, period.id, TODAY) : 0;
  const remaining = budget - spent;
  const after = remaining - amountKop;

  useEffect(() => {
    setAmountKop(0);
    setComment('');
    setDone(false);
  }, [categoryId]);

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

  const submit = async () => {
    if (busy || done || amountKop <= 0 || !categoryId) return;
    const saved = await addTransaction({
      type: 'expense',
      amount: amountKop,
      date: TODAY,
      categoryId,
      comment,
    });
    if (!saved) return;
    setDone(true);
    setTimeout(onClose, 450);
  };

  return (
    <Sheet open={!!categoryId} onClose={onClose} title={cat?.name ?? 'Трата'}>
      {cat && (
        <div className="mb-4 flex items-center gap-3">
          <CategoryIcon category={cat} size={20} />
          <div className="text-sm text-slate-500">
            в конверте останется{' '}
            <motion.span
              key={after}
              initial={{
                scale: 1.08,
                color: after < 0 ? '#ef4444' : '#10b981',
              }}
              animate={{ scale: 1, color: after < 0 ? '#ef4444' : '#10b981' }}
              className="font-bold tabular-nums"
            >
              {formatMoney(after)}
            </motion.span>
          </div>
        </div>
      )}
      <Numpad valueKopecks={amountKop} onKey={onKey} />
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 100))}
        placeholder="Комментарий (необязательно)"
        className="mt-4 w-full rounded-xl bg-slate-100 px-4 py-3 text-[15px] outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-400"
      />
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={submit}
        disabled={amountKop <= 0 || done}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-emerald-500/25 transition
          enabled:hover:bg-emerald-600 disabled:opacity-40"
      >
        {done ? <Check size={18} /> : null}
        {done ? 'Готово' : 'Добавить'}
      </motion.button>
      {onMore && (
        <button
          onClick={onMore}
          className="mt-2 w-full py-1.5 text-center text-[13px] font-semibold text-slate-400 transition hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          Подробнее: дата, обязательство, комментарий
        </button>
      )}
    </Sheet>
  );
}
