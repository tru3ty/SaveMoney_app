import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  Plus,
  Wallet,
  AlertTriangle,
  CalendarClock,
} from 'lucide-react';
import { useBudget } from '../store';
import {
  activePeriod,
  categoryById,
  dashboard,
  envelopeViews,
  obligationNextDate,
  pendingReviewPeriod,
} from '../lib/budget';
import { TODAY } from '../data/mock';
import { formatDate, formatMonth } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { CategoryIcon } from '../components/CategoryIcon';
import { ENVELOPE_COLORS, ProgressBar } from '../components/ProgressBar';
import type { EnvelopeView } from '../types';

interface Props {
  onQuickAdd: (categoryId: string) => void;
  onReview: () => void;
}

function EnvelopeRow({
  env,
  index,
  onAdd,
}: {
  env: EnvelopeView;
  index: number;
  onAdd: () => void;
}) {
  const { data } = useBudget();
  const cat = categoryById(data, env.categoryId);
  const budget = env.limitAmount + env.carryOverAmount;
  const ratio = budget > 0 ? env.spent / budget : 0;
  const negative = env.remaining < 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.05 + index * 0.05,
        type: 'spring',
        stiffness: 300,
        damping: 28,
      }}
      className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-100"
    >
      <div className="flex items-center gap-3">
        <CategoryIcon category={cat} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-semibold text-slate-900">
              {cat?.name ?? env.categoryId}
            </span>
            <span className="shrink-0 text-[13px] font-medium tabular-nums text-slate-500">
              {formatMoney(env.spent)} <span className="text-slate-300">/</span>{' '}
              {formatMoney(budget)}
            </span>
          </div>
          <ProgressBar
            ratio={ratio}
            color={ENVELOPE_COLORS[env.status]}
            className="mt-2"
            delay={0.15 + index * 0.05}
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span
              className={`text-xs font-medium ${negative ? 'text-red-500' : 'text-slate-400'}`}
            >
              {negative
                ? `перебор ${formatMoney(-env.remaining)}`
                : `осталось ${formatMoney(env.remaining)}`}
            </span>
            {env.carryOverAmount > 0 && (
              <span className="text-[11px] font-medium text-emerald-600">
                +{formatMoney(env.carryOverAmount)} перенос
              </span>
            )}
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={onAdd}
          aria-label={`Добавить трату: ${cat?.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 transition hover:bg-emerald-600"
        >
          <Plus size={18} strokeWidth={2.5} />
        </motion.button>
      </div>
    </motion.div>
  );
}

export function Dashboard({ onQuickAdd, onReview }: Props) {
  const { data } = useBudget();
  const period = activePeriod(data);
  const review = pendingReviewPeriod(data);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!period) return null;
  const dash = dashboard(data, period.id, TODAY);
  const envelopes = envelopeViews(data, period.id, TODAY);
  const availableNegative = dash.available < 0;

  // ближайшее неплаченное обязательство для карточки резерва
  const nextObligation = data.obligations
    .filter((o) => o.isActive)
    .map((o) => ({ o, date: obligationNextDate(o, TODAY) }))
    .filter(
      (x): x is { o: typeof x.o; date: string } => !!x.date && x.date > TODAY,
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const horizonLabel = dash.nextIncomeDate
    ? formatDate(dash.nextIncomeDate)
    : formatDate(period.endDate);

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-28">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-4 mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 p-5 text-white shadow-lg shadow-emerald-500/25"
      >
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-emerald-50/80">
            Свободно до {horizonLabel}
          </span>
        </div>
        <div className="mt-2 text-[34px] font-bold leading-none tracking-tight tabular-nums">
          {mounted ? (
            <AnimatedNumber
              value={dash.available}
              format={(v) => formatMoney(v)}
              className={availableNegative ? 'text-red-100' : ''}
            />
          ) : (
            formatMoney(0)
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-emerald-50/90">
          <CalendarClock size={14} />
          {dash.daysLeft} {declOfDays(dash.daysLeft)} до выплаты ·{' '}
          {formatMoney(dash.dailyLimit)}/день
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
          <Wallet size={18} />
        </span>
        <div className="flex-1">
          <div className="text-[15px] font-semibold text-slate-900">
            Зарезервировано {formatMoney(dash.reserved)}
          </div>
          <div className="text-xs text-slate-400">
            {nextObligation
              ? `${nextObligation.o.name} — ${formatDate(nextObligation.date)}`
              : 'обязательств впереди нет'}
          </div>
        </div>
      </motion.div>

      {review && (
        <motion.button
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.12 }}
          onClick={onReview}
          className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-indigo-50 p-4 text-left ring-1 ring-indigo-100 transition hover:bg-indigo-100/70"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
            <AlertTriangle size={18} />
          </span>
          <div className="flex-1">
            <div className="text-[15px] font-semibold text-indigo-900">
              Разберём {formatMonth(review.id).toLowerCase()}
            </div>
            <div className="text-xs text-indigo-500">
              остатки конвертов ждут решения
            </div>
          </div>
          <ChevronRight size={18} className="text-indigo-400" />
        </motion.button>
      )}

      <div className="mx-4 mt-5 flex items-center justify-between">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-400">
          Конверты · {formatMonth(period.id)}
        </h2>
        <span className="text-xs text-slate-400">
          {envelopes.length} категорий
        </span>
      </div>
      <div className="mx-4 mt-2 space-y-2.5">
        {envelopes.map((env, i) => (
          <EnvelopeRow
            key={env.id}
            env={env}
            index={i}
            onAdd={() => onQuickAdd(env.categoryId)}
          />
        ))}
      </div>
    </div>
  );
}

function declOfDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}
