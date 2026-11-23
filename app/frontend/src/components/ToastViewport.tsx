import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useToasts } from '../store';

export function ToastViewport() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none absolute inset-x-4 top-14 z-[120] flex flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl px-4 py-3 shadow-xl ring-1 backdrop-blur
              ${
                t.kind === 'error'
                  ? 'bg-red-50/95 text-red-900 ring-red-200 dark:bg-red-950/90 dark:text-red-100 dark:ring-red-900'
                  : 'bg-emerald-50/95 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/90 dark:text-emerald-100 dark:ring-emerald-900'
              }`}
          >
            {t.kind === 'error' ? (
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
            )}
            <span className="flex-1 text-[13px] font-medium leading-snug">
              {t.text}
            </span>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 opacity-50 hover:opacity-100"
            >
              <X size={15} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
