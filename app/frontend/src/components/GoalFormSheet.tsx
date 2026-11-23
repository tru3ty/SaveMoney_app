import { useRef, useState } from 'react';
import { useBudget } from '../store';
import {
  EntitySheet,
  MoneyField,
  TextField,
  DateField,
  ColorPicker,
  ActiveToggle,
  ICON_CHOICES,
} from './fields';
import { CategoryIcon } from './CategoryIcon';
import { GOAL_COLORS } from '../lib/validate';
import type { Goal } from '../types';

interface Props {
  goal: Goal | 'new' | null;
  open: boolean;
  onClose: () => void;
}

export function GoalFormSheet({ goal, open, onClose }: Props) {
  const { upsertGoal, deleteGoal } = useBudget();
  const editing = goal !== null && goal !== 'new' ? goal : null;

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState(0);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [color, setColor] = useState('#34a06a');
  const [icon, setIcon] = useState('');
  const [active, setActive] = useState(true);
  const loadedFor = useRef<Goal | 'new' | null>(null);

  const seed = goal ?? 'new';
  if (!open) loadedFor.current = null;
  if (open && loadedFor.current !== seed) {
    loadedFor.current = seed;
    setName(editing?.name ?? '');
    setTargetAmount(editing?.targetAmount ?? 0);
    setTargetDate(editing?.targetDate ?? null);
    setColor(editing?.color ?? '#34a06a');
    setIcon(editing?.icon ?? '');
    setActive(editing ? editing.status !== 'archived' : true);
  }

  const submit = () => {
    const ok = upsertGoal(
      {
        name,
        targetAmount,
        targetDate,
        color,
        icon,
        status: active ? 'active' : 'archived',
      },
      editing?.id,
    );
    if (ok) onClose();
  };

  const onDelete = () => {
    if (!editing) return;
    if (deleteGoal(editing.id)) onClose();
  };

  return (
    <EntitySheet
      open={open}
      onClose={onClose}
      title={editing ? 'Изменить цель' : 'Новая цель'}
      onSubmit={submit}
      submitLabel={editing ? 'Сохранить' : 'Создать'}
    >
      <TextField
        label="Название"
        value={name}
        onChange={setName}
        placeholder="Отпуск"
      />
      <MoneyField
        label="Сумма цели"
        value={targetAmount}
        onChange={setTargetAmount}
      />
      <DateField
        label="Срок (необязательно)"
        value={targetDate}
        onChange={setTargetDate}
      />
      <ColorPicker value={color} onChange={setColor} colors={GOAL_COLORS} />
      <div>
        <span className="mb-1.5 block text-[13px] font-semibold text-slate-600 ">
          Иконка
        </span>
        <div className="grid grid-cols-6 gap-1.5">
          {ICON_CHOICES.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(icon === ic ? '' : ic)}
              className={`flex h-10 items-center justify-center rounded-xl transition ${icon === ic ? 'bg-emerald-100 ring-2 ring-emerald-400 dark:bg-emerald-500/20' : 'bg-slate-100 hover:bg-slate-200 '}`}
            >
              <CategoryIcon
                icon={ic}
                color={icon === ic ? '#059669' : '#94a3b8'}
                size={16}
              />
            </button>
          ))}
        </div>
      </div>
      {editing && (
        <>
          <ActiveToggle checked={active} onChange={setActive} />
          <button
            type="button"
            onClick={onDelete}
            className="w-full rounded-xl bg-red-50 py-2.5 text-sm font-bold text-red-500 ring-1 ring-red-100 transition hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20"
          >
            Удалить цель
          </button>
          <p className="text-center text-[11px] text-slate-400 ">
            Цель с операциями нельзя удалить — используйте «Неактивно» (архив).
          </p>
        </>
      )}
    </EntitySheet>
  );
}
