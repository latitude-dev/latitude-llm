/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '2rem',
        lg: '2rem',
      },
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
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        backgroundCode: 'hsl(var(--background-code) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        'background-gray': 'hsl(var(--background-gray) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        'destructive-muted-foreground':
          'hsl(var(--destructive-muted-foreground) / <alpha-value>)',
        'warning-muted-foreground':
          'hsl(var(--warning-muted-foreground) / <alpha-value>)',
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        'destructive-muted': {
          DEFAULT: 'hsl(var(--destructive-muted) / <alpha-value>)',
          foreground:
            'hsl(var(--destructive-muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          button: 'hsl(var(--accent-button) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        purple: {
          DEFAULT: 'hsl(var(--purple) / <alpha-value>)',
        },
        yellow: {
          DEFAULT: 'hsl(var(--yellow) / <alpha-value>)',
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
          '100%': { backgroundColor: 'hsl(var(--accent))' },
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
      width: {
        modal: '580px',
        'modal-lg': '720px',
      },
      minWidth: {
        modal: '580px',
        'modal-lg': '720px',
      },
      maxWidth: {
        modal: '580px',
        'modal-lg': '720px',
        chat: '1024px'
      },
      transitionDelay: {
        250: '250ms',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
