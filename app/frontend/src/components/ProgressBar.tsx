import { motion } from 'framer-motion';

interface Props {
  ratio: number; // 0..1+
  color: string;
  className?: string;
  delay?: number;
}

export function ProgressBar({
  ratio,
  color,
  className = '',
  delay = 0,
}: Props) {
  const pct = Math.min(1, Math.max(0, ratio));
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 22, delay }}
      />
    </div>
  );
}

export const ENVELOPE_COLORS = {
  ok: '#10b981',
  warning: '#f59e0b',
  over: '#ef4444',
} as const;
