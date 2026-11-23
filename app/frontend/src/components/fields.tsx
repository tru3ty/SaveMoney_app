import { useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';
import { Field, inputCls, Toggle } from './ui';
import { rublesToKopecks } from '../lib/money';

export function kopecksToRublesInput(kop: number): string {
  return (kop / 100).toFixed(2).replace('.', ',');
}

interface MoneyFieldProps {
  label: string;
  value: number; // копейки
  onChange: (kop: number) => void;
  hint?: string;
  allowZero?: boolean;
}

/** Сумма в рублях с двумя знаками; наружу — целые копейки */
export function MoneyField({
  label,
  value,
  onChange,
  hint,
  allowZero = false,
}: MoneyFieldProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const shown = text ?? kopecksToRublesInput(value);

  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') {
      setError('');
      onChange(0);
      return;
    }
    const kop = rublesToKopecks(raw);
    if (kop === null) {
      setError('Формат: 1234,56');
      return;
    }
    setError('');
    if (!allowZero && kop === 0) {
      setError('Сумма должна быть больше нуля');
      return;
    }
    onChange(kop);
  };

  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          inputMode="decimal"
          value={shown}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(null)}
          placeholder="0,00"
          className={`${inputCls} pr-10 tabular-nums ${error ? 'ring-2 ring-red-400' : ''}`}
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
          ₽
        </span>
      </div>
      {error && (
        <span className="mt-1 block text-xs font-medium text-red-500">
          {error}
        </span>
      )}
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 100,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </Field>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <Field label={label} hint="Необязательно">
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputCls}
      />
    </Field>
  );
}

export function ColorPicker({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (c: string) => void;
  colors: readonly string[];
}) {
  return (
    <Field label="Цвет">
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            className={`h-8 w-8 rounded-full transition ${value.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-slate-900 ring-offset-2 ' : 'hover:scale-110'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </Field>
  );
}

export function ActiveToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Toggle
      checked={checked}
      onChange={onChange}
      label={checked ? 'Активно' : 'Неактивно'}
    />
  );
}

interface EntitySheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  disabled?: boolean;
}

/** Шторка формы сущности: поля + кнопка сохранения */
export function EntitySheet({
  open,
  onClose,
  title,
  children,
  onSubmit,
  submitLabel = 'Сохранить',
  disabled,
}: EntitySheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {children}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 "
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled}
            className="flex-[2] rounded-2xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600 disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export const ICON_CHOICES = [
  'home',
  'utensils',
  'bus',
  'heart-pulse',
  'party-popper',
  'shapes',
  'shirt',
  'car',
  'gift',
  'book',
  'dumbbell',
  'phone',
  'paw',
  'coffee',
  'wallet',
  'palmtree',
  'shield',
  'bike',
];
