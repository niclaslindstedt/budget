import {
  AlignLeft,
  Banknote,
  Briefcase,
  Calendar,
  Car,
  Check,
  Coffee,
  CreditCard,
  DollarSign,
  Film,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Music,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Stethoscope,
  Tag,
  Utensils,
  Wallet,
  Zap,
} from "lucide-react";

import type { CategoryIcon, ColumnType } from "../data/types";

const COLUMN_ICONS: Record<ColumnType, typeof Calendar> = {
  date: Calendar,
  description: AlignLeft,
  amount: DollarSign,
  balance: Wallet,
  completed: Check,
  category: Tag,
};

export function ColumnIcon({
  type,
  size = 16,
  className,
}: {
  type: ColumnType;
  size?: number;
  className?: string;
}) {
  const Icon = COLUMN_ICONS[type];
  return (
    <Icon size={size} className={className} aria-hidden focusable={false} />
  );
}

const CATEGORY_ICONS: Record<CategoryIcon, typeof Tag> = {
  tag: Tag,
  home: Home,
  car: Car,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  coffee: Coffee,
  pizza: Pizza,
  heart: Heart,
  gift: Gift,
  music: Music,
  film: Film,
  plane: Plane,
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  stethoscope: Stethoscope,
  pill: Pill,
  receipt: Receipt,
  banknote: Banknote,
  "credit-card": CreditCard,
  "piggy-bank": PiggyBank,
  wallet: Wallet,
  zap: Zap,
  sparkles: Sparkles,
  star: Star,
};

export function CategoryIconGlyph({
  name,
  size = 14,
  className,
}: {
  name: CategoryIcon;
  size?: number;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[name];
  return (
    <Icon size={size} className={className} aria-hidden focusable={false} />
  );
}
