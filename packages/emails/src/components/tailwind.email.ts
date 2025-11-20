import { pixelBasedPreset } from '@react-email/components'

/**
 * Sadly sharing CSS variables between web and email is not possible due to the
 * limited support for CSS variables in email clients. Therefore, we have to
 * duplicate some colors here.
 */
export default {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      lineHeight: {
        h1: '48px',
      },
      colors: {
        border: '#E5E5E5',
        foreground: '#030712',
        muted: {
          foreground: '#545E69',
        },
        primary: {
          DEFAULT: '#076BD5',
          'dark-1': '#0657AE',
          'dark-2': '#054387',
        },
        secondary: {
          DEFAULT: '#F9FAFB',
        },
        destructive: {
          DEFAULT: '#DC2626',
        },
        'destructive-muted': {
          DEFAULT: '#FEE2E2',
          foreground: '#DC2626',
        },
      },
    },
  },
}
