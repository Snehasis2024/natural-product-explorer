/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'), surface: token('surface'), raised: token('raised'), line: token('line'),
        ink: token('ink'), muted: token('muted'), faint: token('faint'),
        accent: token('accent'), accentInk: token('accent-ink'),
        ok: token('ok'), warn: token('warn'), bad: token('bad'),
        pw: {
          alk: token('pw-alk'), shk: token('pw-shk'), ter: token('pw-ter'), pk: token('pw-pk'),
          aa: token('pw-aa'), fa: token('pw-fa'), carb: token('pw-carb'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { panel: '10px' },
    },
  },
  plugins: [],
};
