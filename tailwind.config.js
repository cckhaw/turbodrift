/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        obsidian: '#090D16',
        apple: { blue: '#007AFF', pink: '#FF2D55', green: '#30D158', yellow: '#FFD60A' },
        arcade: { cyan: '#5AC8FA', violet: '#BF5AF2', lava: '#FF6A00' },
        glass: {
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          strong: 'rgba(255, 255, 255, 0.14)',
          border: 'rgba(255, 255, 255, 0.15)',
        },
      },
      borderRadius: { squircle: '24px', pill: '999px' },
      backdropBlur: { glass: '28px' },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        'neon-blue': '0 0 24px rgba(0, 122, 255, 0.55)',
        'neon-pink': '0 0 24px rgba(255, 45, 85, 0.55)',
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(1.8)', opacity: '0' }, '25%': { opacity: '1' }, '100%': { transform: 'scale(1)', opacity: '0.9' } },
        rise: { '0%': { transform: 'translateY(16px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        toast: { '0%': { transform: 'translateY(-8px)', opacity: '0' }, '15%,85%': { transform: 'translateY(0)', opacity: '1' }, '100%': { opacity: '0' } },
      },
      animation: { pop: 'pop 0.9s ease-out both', rise: 'rise 0.35s cubic-bezier(.2,.8,.2,1) both', toast: 'toast 1.8s ease both' },
    },
  },
  plugins: [],
};
