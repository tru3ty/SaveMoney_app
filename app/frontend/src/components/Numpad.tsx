import { Delete } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
  valueKopecks: number; // сумма в копейках, набранная numpad'ом
  onKey: (key: string) => void;
  onBackspace?: () => void;
}

function display(kop: number): string {
  const rub = kop / 100;
  return rub.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];

export function Numpad({ valueKopecks, onKey }: Props) {
  return (
    <div>
      <div className="mb-3 flex h-14 items-end justify-center overflow-hidden">
        <motion.span
          key={valueKopecks}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-4xl font-bold tabular-nums tracking-tight text-slate-900"
        >
          {valueKopecks === 0 ? '0,00' : display(valueKopecks)}
          <span className="ml-1 text-xl font-semibold text-slate-400">₽</span>
        </motion.span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <motion.button
            key={k}
            whileTap={{ scale: 0.94 }}
            onClick={() => onKey(k)}
            className={`flex h-14 items-center justify-center rounded-2xl text-xl font-semibold transition
              ${
                k === 'del'
                  ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300'
              }`}
          >
            {k === 'del' ? <Delete size={20} /> : k}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
