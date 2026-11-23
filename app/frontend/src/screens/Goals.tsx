import { useState } from 'react';
import { motion } from 'framer-motion';
import { Archive, Pencil, Plus, Trash2 } from 'lucide-react';
import { useBudget } from '../store';
import { goalView } from '../lib/budget';
import { isDemoMode, TODAY } from '../lib/mode';
import { formatMoney } from '../lib/money';
import { formatDate } from '../lib/dates';
import { CategoryIcon } from '../components/CategoryIcon';
import { GoalSheet } from '../components/GoalSheet';
import { GoalFormSheet } from '../components/GoalFormSheet';
import type { Goal } from '../types';

function Ring({
  ratio,
  color,
  size = 64,
}: {
  ratio: number;
  color: string;
  size?: number;
}) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, ratio));
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={7}
        style={{ stroke: 'var(--color-slate-200)' }}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.2 }}
      />
    </svg>
  );
}

export function Goals() {
  const { data } = useBudget();
  const [active, setActive] = useState<Goal | null>(null);
  const [form, setForm] = useState<Goal | 'new' | null>(null);

  const goals = data.goals.filter((g) => g.status !== 'archived');
  const archived = data.goals.filter((g) => g.status === 'archived');

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-28">
      <div className="flex items-start justify-between px-4 pt-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 ">
            Цели
          </h1>
          <p className="mt-1 text-sm text-slate-400 ">
            Накопления из операций ·{' '}
            {formatMoney(
              goals.reduce(
                (s, g) => s + (goalView(data, g.id, TODAY)?.saved ?? 0),
                0,
              ),
            )}{' '}
            накоплено
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setForm('new')}
          aria-label="Новая цель"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600"
        >
          <Plus size={20} strokeWidth={2.5} />
        </motion.button>
      </div>

      <div className="mx-4 mt-4 space-y-3">
        {goals.length === 0 && archived.length === 0 && (
          <div className="rounded-3xl bg-white px-4 py-10 text-center text-sm text-slate-400 ring-1 ring-slate-100 ">
            Целей пока нет — нажмите «+», чтобы поставить первую
          </div>
        )}
        {goals.map((g, i) => (
          <GoalCard
            key={g.id}
            goal={g}
            index={i}
            onOpen={() => setActive(g)}
            onEdit={() => setForm(g)}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <>
          <div className="mx-4 mt-6 flex items-center gap-2 px-1">
            <Archive size={13} className="text-slate-300 " />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 ">
              Архив
            </span>
          </div>
          <div className="mx-4 mt-2 space-y-3 opacity-60">
            {archived.map((g, i) => (
              <GoalCard
                key={g.id}
                goal={g}
                index={i}
                archived
                onOpen={() => setForm(g)}
                onEdit={() => setForm(g)}
              />
            ))}
          </div>
        </>
      )}

      <GoalSheet goal={active} onClose={() => setActive(null)} />
      <GoalFormSheet
        goal={form}
        open={form !== null}
        onClose={() => setForm(null)}
      />
    </div>
  );
}

function GoalCard({
  goal: g,
  index,
  onOpen,
  onEdit,
  archived,
}: {
  goal: Goal;
  index: number;
  onOpen: () => void;
  onEdit: () => void;
  archived?: boolean;
}) {
  const { data, deleteGoal } = useBudget();
  const view = goalView(data, g.id, TODAY);
  if (!view) return null;
  const ratio = g.targetAmount > 0 ? view.saved / g.targetAmount : 0;
  const done = view.saved >= g.targetAmount;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.05,
        type: 'spring',
        stiffness: 280,
        damping: 26,
      }}
      className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100 "
    >
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <div className="relative shrink-0">
          <Ring ratio={ratio} color={g.color} />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-bold tabular-nums text-slate-700 ">
              {Math.round(ratio * 100)}%
            </span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CategoryIcon icon={g.icon} color={g.color} size={15} />
            <span className="truncate text-[15px] font-bold text-slate-900 ">
              {g.name}
            </span>
            {done && !archived && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                достигнута
              </span>
            )}
            {archived && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400 ">
                архив
              </span>
            )}
          </div>
          <div className="mt-1 text-[13px] tabular-nums text-slate-500 ">
            {formatMoney(view.saved)} <span className="text-slate-300 ">/</span>{' '}
            {formatMoney(g.targetAmount)}
          </div>
          <div className="mt-0.5 text-xs text-slate-400 ">
            {g.targetDate
              ? `к ${formatDate(g.targetDate)}${view.perMonth ? ` · ${formatMoney(view.perMonth)}/мес` : ''}`
              : 'без срока'}
          </div>
        </div>
        {!archived && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 ">
            <Plus size={18} />
          </span>
        )}
      </button>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          onClick={onEdit}
          aria-label={`Изменить: ${g.name}`}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 "
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => deleteGoal(g.id)}
          aria-label={`${isDemoMode ? 'Удалить' : 'В архив'}: ${g.name}`}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          {isDemoMode ? <Trash2 size={14} /> : <Archive size={14} />}
        </button>
      </div>
    </motion.div>
  );
}
