export const colors = {
  backgrounds: {
    transparent: 'bg-transparent',
  },
  textColors: {
    white: 'text-white',
    foreground: 'text-foreground',
    foregroundMuted: 'text-muted-foreground',
    accent: 'text-accent',
    destructive: 'text-destructive',
    destructiveForeground: 'text-destructive-foreground',
    accentForeground: 'text-accent-foreground',
  },
  borderColors: {
    transparent: 'border-transparent',
    white: 'border-white',
    border: 'border-border',
  },
}
export type TextColor = keyof typeof colors.textColors
export type BorderColor = keyof typeof colors.borderColors
export type BackgroundColor = keyof typeof colors.backgrounds
