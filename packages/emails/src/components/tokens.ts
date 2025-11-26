export const colors = {
  textColors: {
    white: 'text-white',
    foreground: 'text-foreground',
    foregroundMuted: 'text-muted-foreground',
    primary: 'text-primary',
    destructive: 'text-destructive-foreground',
    destructiveMuted: 'text-destructive-muted-foreground',
  },
}

export type TextColor = keyof typeof colors.textColors
