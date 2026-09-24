export const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(d));
export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const PW_VARS: Record<string, string> = {
  Alkaloids: 'pw-alk', 'Shikimates and Phenylpropanoids': 'pw-shk', Terpenoids: 'pw-ter', Polyketides: 'pw-pk',
  'Amino acids and Peptides': 'pw-aa', 'Fatty acids': 'pw-fa', Carbohydrates: 'pw-carb',
};
export const pathwayVar = (p: string) => PW_VARS[p] || 'muted';
export const pathwayColor = (p: string, alpha = 1) => `rgb(var(--${pathwayVar(p)}) / ${alpha})`;

/** Superclass/class labels are too many for distinct hues; they share the accent (identity comes from the text). */
export function labelColor(_label: string, alpha = 1) {
  return `rgb(var(--accent) / ${alpha})`;
}

/** Up to 7 validated categorical slots in fixed order; everything beyond folds into "Other". */
export const CATEGORICAL = ['pw-alk', 'pw-shk', 'pw-ter', 'pw-pk', 'pw-aa', 'pw-fa', 'pw-carb'].map((v) => `rgb(var(--${v}))`);
export const OTHER_COLOR = 'rgb(var(--faint))';

/** Subscript digits in a molecular formula for display. */
export function formulaParts(formula: string): { text: string; sub: boolean }[] {
  const parts: { text: string; sub: boolean }[] = [];
  const re = /(\d+)|([^\d]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula))) parts.push({ text: m[0], sub: !!m[1] });
  return parts;
}

export function safeStorage() {
  return {
    get(key: string): string | null {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    set(key: string, value: string) {
      try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ }
    },
  };
}
