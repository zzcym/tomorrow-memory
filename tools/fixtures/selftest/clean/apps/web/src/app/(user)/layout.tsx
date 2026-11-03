import type { ReactNode } from 'react';
import { NavTabs } from '@tm/ui';

export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <NavTabs />
      <main className="flex-1 px-4">{children}</main>
    </div>
  );
}
