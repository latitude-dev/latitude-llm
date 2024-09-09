export const colors = {
  backgrounds: {
    transparent: 'bg-transparent',
  },
  textColors: {
    white: 'text-white',
    primary: 'text-primary',
    foreground: 'text-foreground',
    background: 'text-background',
    foregroundMuted: 'text-muted-foreground',
    accent: 'text-accent',
    destructive: 'text-destructive',
    destructiveForeground: 'text-destructive-foreground',
    destructiveMutedForeground: 'text-destructive-muted-foreground',
    accentForeground: 'text-accent-foreground',
    secondaryForeground: 'text-secondary-foreground',
    warningMutedForeground: 'text-warning-muted-foreground',
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
