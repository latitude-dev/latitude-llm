/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    fontFamily: {
      sans: ['var(--font-sans)'],
      mono: ['var(--font-mono)'],
    },
    extend: {
      fontSize: {
        h2: '26px',
      },
      colors: {
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        backgroundCode: 'rgb(var(--background-code) / <alpha-value>)',
        background: 'rgb(var(--background) / <alpha-value>)',
        'background-gray': 'rgb(var(--background-gray) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          foreground: 'rgb(var(--success-foreground) / <alpha-value>)',
        },
        'destructive-muted-foreground':
          'rgb(var(--destructive-muted-foreground) / <alpha-value>)',
        'warning-muted-foreground':
          'rgb(var(--warning-muted-foreground) / <alpha-value>)',
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        'destructive-muted': {
          DEFAULT: 'rgb(var(--destructive-muted-foreground) / <alpha-value>)',
          foreground:
            'rgb(var(--destructive-muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        purple: {
          DEFAULT: 'rgb(var(--purple) / <alpha-value>)',
        },
        yellow: {
          DEFAULT: 'rgb(var(--yellow) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'flash-background': {
          '0%': { backgroundColor: 'transparent' },
          '100%': { backgroundColor: 'rgb(var(--accent))' },
        },
        'gradient-animation': {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
        shine: {
          '0%': { transform: 'translateX(-100%)' },
          '25%': { transform: 'translateX(100%)' }, // Hack to apply a delay between animation iterations
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        flash: 'flash-background 1s ease-in-out',
        'text-gradient': 'gradient-animation 3s linear infinite',
        shine: 'shine 12s linear infinite',
      },
      maxWidth: {
        modal: '580px',
        'modal-lg': '720px',
      },
      transitionDelay: {
        250: '250ms',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
