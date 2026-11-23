import { motion } from 'framer-motion';
import { Home, History, Target, PieChart, Plus } from 'lucide-react';

export type Tab = 'home' | 'history' | 'goals' | 'reports';

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'history', label: 'История', icon: History },
  { id: 'goals', label: 'Цели', icon: Target },
  { id: 'reports', label: 'Отчёты', icon: PieChart },
];

interface Props {
  tab: Tab;
  onChange: (t: Tab) => void;
  onFab: () => void;
}

export function BottomNav({ tab, onChange, onFab }: Props) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/90 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl">
      <div className="flex items-end justify-around px-2">
        {TABS.slice(0, 2).map((t) => (
          <NavItem
            key={t.id}
            {...t}
            active={tab === t.id}
            onClick={() => onChange(t.id)}
          />
        ))}

        {/* FAB по центру */}
        <div className="relative -top-5 flex flex-col items-center">
          <motion.button
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.05 }}
            onClick={onFab}
            aria-label="Новая операция"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-xl shadow-emerald-500/40 ring-4 ring-slate-50"
          >
            <Plus size={26} strokeWidth={2.5} />
          </motion.button>
          <span className="mt-1 text-[10px] font-semibold text-slate-400">
            Операция
          </span>
        </div>

        {TABS.slice(2).map((t) => (
          <NavItem
            key={t.id}
            {...t}
            active={tab === t.id}
            onClick={() => onChange(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NavItem({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  id: Tab;
  label: string;
  icon: typeof Home;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex w-16 flex-col items-center gap-0.5 py-1.5"
    >
      {active && (
        <motion.span
          layoutId="nav-pill"
          className="absolute -top-0.5 h-1 w-8 rounded-full bg-emerald-500"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <Icon
        size={21}
        strokeWidth={active ? 2.4 : 2}
        className={active ? 'text-emerald-600' : 'text-slate-400'}
      />
      <span
        className={`text-[10px] font-semibold ${active ? 'text-emerald-700' : 'text-slate-400'}`}
      >
        {label}
      </span>
    </button>
  );
}
