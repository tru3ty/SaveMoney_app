import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, ArrowRightLeft, PiggyBank, Check } from 'lucide-react';
import { useBudget } from '../store';
import { categoryById, pendingReviewPeriod, spentFor } from '../lib/budget';
import { formatMoney } from '../lib/money';
import { formatMonth } from '../lib/dates';
import { CategoryIcon } from '../components/CategoryIcon';
import type { ClosureDecision, EnvelopeView } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const DECISIONS: {
  value: ClosureDecision;
  label: string;
  hint: string;
  icon: typeof Flame;
}[] = [
  { value: 'burn', label: 'Сжечь', hint: 'закрыть без переноса', icon: Flame },
  {
    value: 'carry_over',
    label: 'Перенести',
    hint: 'в конверт ноября',
    icon: ArrowRightLeft,
  },
  {
    value: 'to_goal',
    label: 'В копилку',
    hint: 'выбрать цель',
    icon: PiggyBank,
  },
];

export function ClosureModal({ open, onClose }: Props) {
  const { data, setClosure, applyClosures } = useBudget();
  const [draft, setDraft] = useState<
    Record<string, { decision: ClosureDecision; goalId: string | null }>
  >({});

  const review = pendingReviewPeriod(data);
  // конверты октября с остатками на конец периода
  const rows = useMemo<EnvelopeView[]>(() => {
    if (!review) return [];
    return data.envelopes
      .filter((e) => e.periodId === review.id)
      .map((e) => {
        const spent = spentFor(data, e.categoryId, review.id);
        const budget = e.limitAmount + e.carryOverAmount;
        return {
          ...e,
          spent,
          remaining: budget - spent,
          status: 'ok' as const,
        };
      });
  }, [data, review]);

  if (!open || !review) return null;

  const decided = rows.filter((r) => draft[r.id]).length;
  const allDecided = decided === rows.length && rows.length > 0;
  const goals = data.goals.filter((g) => g.status === 'active');

  const pick = (
    envelopeId: string,
    decision: ClosureDecision,
    goalId: string | null,
  ) => {
    const next = { ...draft, [envelopeId]: { decision, goalId } };
    setDraft(next);
    setClosure(envelopeId, decision, goalId);
  };

  const apply = () => {
    applyClosures();
    setDraft({});
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-[60] bg-slate-950/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-3 bottom-3 top-16 z-[70] flex flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="border-b border-slate-100 px-5 pb-4 pt-5">
              <h2 className="text-xl font-bold text-slate-900">
                Разберём {formatMonth(review.id).toLowerCase()}
              </h2>
              <p className="mt-1 text-[13px] text-slate-400">
                Куда деть остатки конвертов? Решено {decided} из {rows.length}
              </p>
              {/* прогресс решений */}
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-indigo-500"
                  animate={{
                    width: `${(decided / Math.max(1, rows.length)) * 100}%`,
                  }}
                  transition={{ type: 'spring', stiffness: 160, damping: 24 }}
                />
              </div>
            </div>

            <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {rows.map((env, i) => {
                const cat = categoryById(data, env.categoryId);
                const positive = env.remaining > 0;
                const d = draft[env.id];
                return (
                  <motion.div
                    key={env.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <CategoryIcon category={cat} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-slate-900">
                          {cat?.name}
                        </div>
                        <div className="text-xs tabular-nums text-slate-400">
                          {formatMoney(env.spent)} /{' '}
                          {formatMoney(env.limitAmount + env.carryOverAmount)}
                        </div>
                      </div>
                      <div
                        className={`text-[15px] font-bold tabular-nums ${positive ? 'text-emerald-600' : 'text-slate-500'}`}
                      >
                        {positive ? '+' : ''}
                        {formatMoney(env.remaining)}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      {DECISIONS.map(({ value, label, icon: Icon }) => {
                        const activeD = d?.decision === value;
                        const disabled =
                          value === 'to_goal' && env.remaining <= 0;
                        return (
                          <button
                            key={value}
                            disabled={disabled}
                            onClick={() =>
                              pick(
                                env.id,
                                value,
                                value === 'to_goal'
                                  ? (d?.goalId ?? goals[0]?.id ?? null)
                                  : null,
                              )
                            }
                            className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-bold transition
                              ${
                                activeD
                                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/25'
                                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50'
                              }
                              ${disabled ? 'opacity-35' : ''}`}
                          >
                            <Icon size={15} />
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <AnimatePresence>
                      {d?.decision === 'to_goal' && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1">
                            {goals.map((g) => (
                              <button
                                key={g.id}
                                onClick={() => pick(env.id, 'to_goal', g.id)}
                                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition
                                  ${
                                    d.goalId === g.id
                                      ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                                      : 'bg-white text-slate-500 ring-1 ring-slate-200'
                                  }`}
                              >
                                <CategoryIcon
                                  icon={g.icon}
                                  color={g.color}
                                  size={11}
                                />
                                {g.name}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>

            <div className="border-t border-slate-100 bg-white px-5 pb-5 pt-4">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={apply}
                disabled={!allDecided}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-indigo-500/25 transition
                  enabled:hover:bg-indigo-600 disabled:opacity-40"
              >
                {allDecided && <Check size={18} />}
                {allDecided
                  ? 'Завершить разбор'
                  : `Осталось решений: ${rows.length - decided}`}
              </motion.button>
              <button
                onClick={onClose}
                className="mt-2 w-full py-2 text-sm font-medium text-slate-400 transition hover:text-slate-600"
              >
                Вернуться позже
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
