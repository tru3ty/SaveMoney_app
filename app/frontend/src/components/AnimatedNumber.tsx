import { useEffect } from 'react';
import { animate, useMotionValue, useTransform, motion } from 'framer-motion';

interface Props {
  value: number;
  format: (n: number) => string;
  className?: string;
  duration?: number;
}

/** Плавно «докручивает» число до value и форматирует */
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 0.9,
}: Props) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(Math.round(v)));

  useEffect(() => {
    const controls = animate(mv, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [value, duration, mv]);

  return <motion.span className={className}>{text}</motion.span>;
}
