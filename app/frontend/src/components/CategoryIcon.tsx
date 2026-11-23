import type { Category } from '../types';
import {
  Home,
  UtensilsCrossed,
  Bus,
  HeartPulse,
  PartyPopper,
  Shapes,
  Wallet,
  Palmtree,
  Shield,
  Bike,
  Circle,
  type LucideIcon,
  Shirt,
  Car,
  Gift,
  BookOpen,
  Dumbbell,
  Smartphone,
  PawPrint,
  Coffee,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  home: Home,
  utensils: UtensilsCrossed,
  bus: Bus,
  'heart-pulse': HeartPulse,
  'party-popper': PartyPopper,
  shapes: Shapes,
  wallet: Wallet,
  palmtree: Palmtree,
  shield: Shield,
  bike: Bike,
  shirt: Shirt,
  car: Car,
  gift: Gift,
  book: BookOpen,
  dumbbell: Dumbbell,
  phone: Smartphone,
  paw: PawPrint,
  coffee: Coffee,
};

export function iconFor(name: string): LucideIcon {
  return MAP[name] ?? Circle;
}

interface Props {
  category?: Category | null;
  icon?: string;
  color?: string;
  size?: number;
  className?: string;
}

export function CategoryIcon({
  category,
  icon,
  color,
  size = 18,
  className = '',
}: Props) {
  const name = icon ?? category?.icon ?? '';
  const Icon = iconFor(name);
  const c = color ?? category?.color ?? '#64748b';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{
        width: size + 16,
        height: size + 16,
        backgroundColor: `${c}1a`,
        color: c,
      }}
    >
      <Icon size={size} strokeWidth={2.2} />
    </span>
  );
}
