import { AlignLeft, Calendar, Check, DollarSign, Wallet } from "lucide-react";

import type { ColumnType } from "../data/types";

const ICONS: Record<ColumnType, typeof Calendar> = {
  date: Calendar,
  description: AlignLeft,
  amount: DollarSign,
  balance: Wallet,
  completed: Check,
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
  const Icon = ICONS[type];
  return (
    <Icon size={size} className={className} aria-hidden focusable={false} />
  );
}
