import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings } from 'lucide-react';
import { BudgetProvider } from './store';
import { Dashboard } from './screens/Dashboard';
import { History } from './screens/History';
import { Goals } from './screens/Goals';
import { Reports } from './screens/Reports';
import { SettingsScreen } from './screens/SettingsScreen';
import { BottomNav, type Tab } from './components/BottomNav';
import { QuickAddSheet } from './components/QuickAddSheet';
import { FullFormSheet, type TxPreset } from './components/FullFormSheet';
import { ClosureModal } from './components/ClosureModal';
import { ThemeToggle } from './components/ThemeToggle';
import { ToastViewport } from './components/ToastViewport';
import type { Transaction } from './types';

interface TxFormState {
  open: boolean;
  preset?: TxPreset | null;
  tx?: Transaction | null;
}

const CLOSED_FORM: TxFormState = { open: false };

function Shell() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [quickAddCat, setQuickAddCat] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [txForm, setTxForm] = useState<TxFormState>(CLOSED_FORM);

  const openTxForm = (preset?: TxPreset) =>
    setTxForm({ open: true, preset: preset ?? null });
  const openTxEdit = (tx: Transaction) => setTxForm({ open: true, tx });

  return (
    <div ref={shellRef} className="app-shell">
      <ThemeToggle shellRef={shellRef} />
      <button
        onClick={() => setSettingsOpen(true)}
        aria-label="Настройки"
        className="absolute right-14 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-md ring-1 ring-slate-200/70 backdrop-blur-md transition hover:text-slate-800 "
      >
        <Settings size={17} />
      </button>

      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {tab === 'home' && (
            <Dashboard
              onQuickAdd={setQuickAddCat}
              onReview={() => setReviewOpen(true)}
            />
          )}
          {tab === 'history' && <History onEditTx={openTxEdit} />}
          {tab === 'goals' && <Goals />}
          {tab === 'reports' && <Reports />}
        </motion.main>
      </AnimatePresence>

      <BottomNav tab={tab} onChange={setTab} onFab={() => setFabOpen(true)} />

      <QuickAddSheet
        categoryId={quickAddCat}
        onClose={() => setQuickAddCat(null)}
        onMore={
          quickAddCat
            ? () => {
                const cat = quickAddCat;
                setQuickAddCat(null);
                openTxForm({ type: 'expense', categoryId: cat });
              }
            : undefined
        }
      />
      <FullFormSheet
        open={fabOpen || txForm.open}
        onClose={() => {
          setFabOpen(false);
          setTxForm(CLOSED_FORM);
        }}
        preset={txForm.preset}
        tx={txForm.tx}
      />
      <ClosureModal open={reviewOpen} onClose={() => setReviewOpen(false)} />

      <AnimatePresence>
        {settingsOpen && (
          <SettingsScreen
            key="settings"
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

      <ToastViewport />
    </div>
  );
}

export default function App() {
  return (
    <BudgetProvider>
      <Shell />
    </BudgetProvider>
  );
}
