export const colors = {
  backgrounds: {
    transparent: 'bg-transparent',
    backgroundCode: 'bg-backgroundCode',
    backgroundSecondary: 'bg-secondary',
    mutedForeground: 'bg-muted-foreground',
    accent: 'bg-accent',
    destructiveMutedForeground: 'bg-destructive-muted-foreground',
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
    success: 'text-success',
    successForeground: 'text-success-foreground',
    accentForeground: 'text-accent-foreground',
    secondaryForeground: 'text-secondary-foreground',
    warningForeground: 'text-warning-foreground',
    warningMutedForeground: 'text-warning-muted-foreground',
  },
  darkTextColors: {
    white: 'dark:text-white',
    primary: 'dark:text-primary',
    foreground: 'dark:text-foreground',
    background: 'dark:text-background',
    foregroundMuted: 'dark:text-muted-foreground',
    accent: 'dark:text-accent',
    destructive: 'dark:text-destructive',
    destructiveForeground: 'dark:text-destructive-foreground',
    destructiveMutedForeground: 'dark:text-destructive-muted-foreground',
    success: 'dark:text-success',
    successForeground: 'dark:text-success-foreground',
    accentForeground: 'dark:text-accent-foreground',
    secondaryForeground: 'dark:text-secondary-foreground',
    warningForeground: 'dark:text-warning-foreground',
    warningMutedForeground: 'dark:text-warning-muted-foreground',
  },
  borderColors: {
    transparent: 'border-transparent',
    white: 'border-white',
    border: 'border-border',
  },
}
export type TextColor = keyof typeof colors.textColors
export type DarkTextColor = keyof typeof colors.darkTextColors
export type BorderColor = keyof typeof colors.borderColors
export type BackgroundColor = keyof typeof colors.backgrounds
