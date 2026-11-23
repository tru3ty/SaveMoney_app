import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';
import { Sheet } from '../components/Sheet';
import { Numpad } from '../components/Numpad';
import { useBudget } from '../store';
import { goalView } from '../lib/budget';
import { TODAY } from '../lib/mode';
import { formatMoney } from '../lib/money';
import { formatDate } from '../lib/dates';
import type { Goal } from '../types';

interface Props {
  goal: Goal | null;
  onClose: () => void;
}

/** «Отложить» / «Снять» с цели — numpad как в быстром вводе */
export function GoalSheet({ goal, onClose }: Props) {
  const { data, busy, addTransaction } = useBudget();
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amountKop, setAmountKop] = useState(0);
  const [done, setDone] = useState(false);

  const view = goal ? goalView(data, goal.id, TODAY) : null;

  const reset = () => {
    setMode('deposit');
    setAmountKop(0);
    setDone(false);
  };

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
    if (busy || done || !goal || amountKop <= 0) return;
    const saved = await addTransaction({
      type: mode === 'deposit' ? 'goal_deposit' : 'goal_withdrawal',
      amount: amountKop,
      date: TODAY,
      goalId: goal.id,
      comment: mode === 'deposit' ? 'Пополнение цели' : 'Снятие с цели',
    });
    if (!saved) return;
    setDone(true);
    setTimeout(() => {
      reset();
      onClose();
    }, 400);
  };

  return (
    <Sheet open={!!goal} onClose={onClose} title={goal?.name ?? ''}>
      {goal && view && (
        <>
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <div>
              <div className="text-xs text-slate-400">Накоплено</div>
              <div className="text-xl font-bold tabular-nums text-slate-900">
                {formatMoney(view.saved)}
                <span className="text-sm font-medium text-slate-400">
                  {' '}
                  / {formatMoney(goal.targetAmount)}
                </span>
              </div>
            </div>
            {view.perMonth !== null && (
              <div className="text-right">
                <div className="text-xs text-slate-400">Нужно в месяц</div>
                <div className="text-sm font-bold text-slate-700">
                  {formatMoney(view.perMonth)}
                </div>
              </div>
            )}
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setMode('deposit')}
              className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition ${
                mode === 'deposit'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Plus size={16} /> Отложить
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setMode('withdraw')}
              className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition ${
                mode === 'withdraw'
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Minus size={16} /> Снять
            </motion.button>
          </div>

          <Numpad valueKopecks={amountKop} onKey={onKey} />

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={submit}
            disabled={amountKop <= 0 || done}
            className={`mt-4 w-full rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-lg transition
              ${mode === 'deposit' ? 'bg-emerald-500 shadow-emerald-500/25 hover:bg-emerald-600' : 'bg-amber-500 shadow-amber-500/25 hover:bg-amber-600'}
              disabled:opacity-40`}
          >
            {done ? 'Готово' : mode === 'deposit' ? 'Пополнить' : 'Снять'}
          </motion.button>
          {goal.targetDate && (
            <div className="mt-2 text-center text-xs text-slate-400">
              Цель к {formatDate(goal.targetDate)}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
