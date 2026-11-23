import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
} from 'lucide-react';
import { useBudget } from '../store';
import {
  expenseByCategory,
  periodTotalExpense,
  prevPeriodId,
  activePeriod,
} from '../lib/budget';
import { formatMoney } from '../lib/money';
import { formatMonth } from '../lib/dates';
import { CategoryIcon } from '../components/CategoryIcon';

const DONUT_COLORS = [
  '#10b981',
  '#f59e0b',
  '#3b82f6',
  '#8b5cf6',
  '#ef4444',
  '#64748b',
];

function Donut({
  segments,
}: {
  segments: { amount: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.amount, 0);
  const size = 180;
  const r = 70;
  const c = 2 * Math.PI * r;
  let acc = 0;

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-full border-[14px] border-slate-100 text-sm text-slate-400">
          нет трат
        </div>
      </div>
    );
  }

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={16}
        style={{ stroke: 'var(--color-slate-100)' }}
      />
      {segments.map((s, i) => {
        const frac = s.amount / total;
        const dash = frac * c;
        const offset = -acc * c;
        acc += frac;
        return (
          <motion.circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={16}
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${c - dash}`}
            initial={{ strokeDashoffset: 0, opacity: 0 }}
            animate={{ strokeDashoffset: offset, opacity: 1 }}
            transition={{
              type: 'spring',
              stiffness: 60,
              damping: 18,
              delay: 0.1 + i * 0.06,
            }}
          />
        );
      })}
    </svg>
  );
}

export function Reports() {
  const { data } = useBudget();
  const active = activePeriod(data);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const current = periodId ?? active?.id ?? '';

  const prevId = prevPeriodId(current);
  const cats = useMemo(() => expenseByCategory(data, current), [data, current]);
  const total = useMemo(
    () => periodTotalExpense(data, current),
    [data, current],
  );
  const prevCats = useMemo(
    () => (prevId ? expenseByCategory(data, prevId) : []),
    [data, prevId],
  );
  const prevTotal = useMemo(
    () => (prevId ? periodTotalExpense(data, prevId) : 0),
    [data, prevId],
  );

  const changePct =
    prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  const prevAmountFor = (categoryId: string) =>
    prevCats.find((c) => c.category.id === categoryId)?.amount ?? 0;

  const segments = cats.map((c, i) => ({
    amount: c.amount,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

  const shiftPeriod = (dir: -1 | 1) => {
    const all = data.periods.map((p) => p.id).sort();
    const idx = all.indexOf(current);
    const next = all[idx + dir];
    if (next) setPeriodId(next);
  };

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-28">
      <div className="px-4 pt-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Отчёты
        </h1>

        <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100">
          <button
            onClick={() => shiftPeriod(-1)}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-[15px] font-bold text-slate-900">
            {formatMonth(current)}
          </span>
          <button
            onClick={() => shiftPeriod(1)}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="relative">
            <Donut segments={segments} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Траты
              </span>
              <AnimatedTotal value={total} />
            </div>
          </div>
          {changePct !== null && (
            <div
              className={`mt-3 flex items-center gap-1.5 text-sm font-semibold ${
                changePct < 0
                  ? 'text-emerald-600'
                  : changePct > 0
                    ? 'text-red-500'
                    : 'text-slate-400'
              }`}
            >
              {changePct < 0 ? (
                <TrendingDown size={15} />
              ) : changePct > 0 ? (
                <TrendingUp size={15} />
              ) : (
                <Minus size={15} />
              )}
              {changePct === 0
                ? 'без изменений'
                : `${Math.abs(changePct)}% ${changePct < 0 ? 'меньше' : 'больше'} к ${prevId ? formatMonth(prevId).toLowerCase() : ''}`}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-1.5">
          {cats.map((c, i) => {
            const share = total > 0 ? Math.round((c.amount / total) * 100) : 0;
            const prev = prevAmountFor(c.category.id);
            const delta =
              prev > 0 ? Math.round(((c.amount - prev) / prev) * 100) : null;
            return (
              <motion.div
                key={c.category.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-100"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{
                    backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length],
                  }}
                />
                <CategoryIcon category={c.category} size={15} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="truncate text-[15px] font-semibold text-slate-900">
                      {c.category.name}
                    </span>
                    <span className="text-[15px] font-bold tabular-nums text-slate-900">
                      {formatMoney(c.amount)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-xs text-slate-400">
                    <span>{share}% от трат</span>
                    {delta !== null && (
                      <span
                        className={
                          delta < 0
                            ? 'text-emerald-600'
                            : delta > 0
                              ? 'text-red-400'
                              : ''
                        }
                      >
                        {delta > 0 ? '+' : ''}
                        {delta}%
                      </span>
                    )}
                  </div>
                  {c.children.some((ch) => ch.amount > 0) && (
                    <div className="mt-1.5 space-y-1 border-t border-slate-50 pt-1.5">
                      {c.children
                        .filter((ch) => ch.amount > 0)
                        .map((ch) => (
                          <div
                            key={ch.category.id}
                            className="flex justify-between text-xs text-slate-500"
                          >
                            <span className="truncate">{ch.category.name}</span>
                            <span className="tabular-nums">
                              {formatMoney(ch.amount)}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AnimatedTotal({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0.4, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-xl font-bold tabular-nums text-slate-900"
    >
      {formatMoney(value)}
    </motion.span>
  );
}
