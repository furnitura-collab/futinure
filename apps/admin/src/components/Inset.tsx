import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Karta ichidagi ajratilgan blok (balans, izoh, shartlar) — hamma joyda bir xil chekinish va fon */
export function Inset({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg bg-muted/50 p-3', className)}>{children}</div>;
}
