import type { ReactNode } from 'react';

export function Button({ label, onPress }: { label: string; onPress: () => void }): ReactNode {
  return (
    <button type="button" className="bg-brand text-ink-inverse focus-visible:ring-2" onClick={onPress}>
      {label}
    </button>
  );
}
