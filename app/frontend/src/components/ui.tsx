import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface Props {
  label: string;
  children: ReactNode;
  hint?: string;
}

export function Field({ label, children, hint }: Props) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-600 ">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      )}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl bg-slate-100 px-3.5 py-3 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-400 ';

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-1 text-left"
    >
      <span className="text-[14px] font-medium text-slate-700 ">{label}</span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300 '}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${checked ? 'right-0.5' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition
 ${
   active
     ? 'bg-slate-900 text-white '
     : 'bg-slate-100 text-slate-600 hover:bg-slate-200 '
 }`}
    >
      {children}
    </button>
  );
}

export function RowButton({
  onClick,
  children,
  danger,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-30
 ${danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 '}`}
    >
      {children}
    </motion.button>
  );
}
