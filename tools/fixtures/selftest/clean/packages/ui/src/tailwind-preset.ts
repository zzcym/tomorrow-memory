export const palette = {
  brand: 'var(--brand)',
  surface: 'var(--surface)',
  'surface-elevated': 'var(--surface-elevated)',
  'surface-inverse': 'var(--surface-inverse)',
  ink: 'var(--ink)',
  'ink-muted': 'var(--ink-muted)',
  hair: 'var(--hair)',
} as const;

export default { theme: { extend: { colors: palette } } };
