import type { ReactNode } from 'react';

export function Card({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="border-hair rounded-lg bg-surface-elevated p-4 dark:bg-surface-inverse">
      <h2 className="text-ink dark:text-ink-high">{title}</h2>
      {children}
    </section>
  );
}
