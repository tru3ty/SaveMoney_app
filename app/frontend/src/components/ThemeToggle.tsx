import { useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';

interface Props {
  /** ref на .app-shell — тема вешается классом на него */
  shellRef: React.RefObject<HTMLDivElement | null>;
}

interface Drop {
  angle: number;
  dist: number;
  size: number;
  color: string;
  delay: number;
}

interface Splash {
  id: number;
  x: number;
  y: number;
  drops: Drop[];
}

// Капли — оттенки акцента, а не радуга: эффект должен читаться как «зелёная краска»
const DROP_COLORS = ['#10b981', '#34d399', '#059669', '#6ee7b7', '#047857'];

// Минимальный радиус кляксы в долях от половины маски — нужен для расчёта покрытия экрана
const BLOB_MIN_R = 0.74;

/**
 * Неровная клякса: замкнутая Catmull-Rom кривая через точки со случайным радиусом,
 * плюс несколько «потёков» — острых выступов, как у разлитой краски.
 */
function blobMaskURL(): string {
  const N = 18;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const drip = Math.random() < 0.22 ? 0.12 + Math.random() * 0.12 : 0;
    const r = 100 * (BLOB_MIN_R + Math.random() * 0.16 + drip);
    pts.push([100 + Math.cos(a) * r, 100 + Math.sin(a) * r]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % N];
    const p3 = pts[(i + 2) % N];
    d +=
      `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)},` +
      `${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)},` +
      `${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><path d='${d}Z' fill='black'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

let splashSeq = 0;

export function ThemeToggle({ shellRef }: Props) {
  const [dark, setDark] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const [splash, setSplash] = useState<Splash | null>(null);

  useEffect(() => {
    shellRef.current?.classList.toggle('dark', dark);
  }, [dark, shellRef]);

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    const shell = shellRef.current;
    const next = !dark;
    const apply = () => {
      shell?.classList.toggle('dark', next);
      flushSync(() => setDark(next));
    };

    const doc = document as DocWithVT;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (!shell || reduced || !doc.startViewTransition) {
      apply();
      return;
    }

    const rect = shell.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    // Маска должна в финале накрыть самый дальний угол shell даже своим «впадинным» краем
    const farthest = Math.hypot(
      Math.max(x - rect.left, rect.right - x),
      Math.max(y - rect.top, rect.bottom - y),
    );
    const size = (farthest / BLOB_MIN_R) * 2 * 1.05;

    const root = document.documentElement;
    root.style.setProperty('--spill-x', `${x}px`);
    root.style.setProperty('--spill-y', `${y}px`);
    root.style.setProperty('--spill-size', `${size}px`);
    root.style.setProperty('--spill-mask', blobMaskURL());
    root.classList.add('theme-spill');

    const drops: Drop[] = Array.from({ length: 12 }, (_, i) => ({
      angle: Math.random() * Math.PI * 2,
      dist: 60 + Math.random() * 220,
      size: 5 + Math.random() * 12,
      color: DROP_COLORS[i % DROP_COLORS.length],
      delay: Math.random() * 0.12,
    }));

    const vt = doc.startViewTransition(() => {
      apply();
      flushSync(() =>
        setSplash({
          id: ++splashSeq,
          x: x - rect.left,
          y: y - rect.top,
          drops,
        }),
      );
    });
    vt.finished.finally(() => root.classList.remove('theme-spill'));
  };

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.82, rotate: -20 }}
        onClick={onClick}
        aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
        className="absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-md ring-1 ring-slate-200/70 backdrop-blur-md transition hover:text-slate-800"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={dark ? 'moon' : 'sun'}
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.18 }}
            className="flex"
          >
            {dark ? (
              <Moon size={17} />
            ) : (
              <Sun size={17} className="text-amber-500" />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* Брызги: отдельная view-transition группа, чтобы лететь поверх и за край кляксы */}
      {splash && (
        <div
          key={splash.id}
          className="pointer-events-none absolute inset-0 z-[100]"
          style={{ viewTransitionName: 'spill-drops' }}
        >
          {splash.drops.map((d, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{
                left: splash.x - d.size / 2,
                top: splash.y - d.size / 2,
                width: d.size,
                height: d.size,
                backgroundColor: d.color,
              }}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
              animate={{
                x: Math.cos(d.angle) * d.dist,
                y: Math.sin(d.angle) * d.dist + 30, // лёгкая «гравитация»
                scale: [0, 1.2, 0.6],
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: 0.95,
                delay: 0.1 + d.delay,
                ease: [0.15, 0.7, 0.35, 1],
              }}
              onAnimationComplete={i === 0 ? () => setSplash(null) : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}
