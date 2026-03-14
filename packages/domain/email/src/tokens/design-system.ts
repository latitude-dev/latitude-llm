export const emailDesignTokens = {
  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  colors: {
    border: "#E5E5E5",
    foreground: "#030712",
    mutedForeground: "#545E69",
    primary: "#076BD5",
    primaryDark: "#0657AE",
    accent: "#EFF7FF",
    secondary: "#F9FAFB",
    white: "#FFFFFF",
  },
  typography: {
    heading: "text-lg leading-7 font-medium",
    body: "text-base leading-6 font-normal",
    bodySmall: "text-sm leading-5 font-normal",
    button: "text-sm leading-5 font-medium",
  },
  spacing: {
    contentGap: "mb-6",
    headingGap: "mb-2",
    buttonTop: "mt-6",
    footnoteTop: "mt-8",
  },
  radius: {
    card: "rounded-2xl",
    button: "rounded-lg",
  },
} as const

export const emailTailwindConfig = {
  theme: {
    extend: {
      lineHeight: {
        h1: "48px",
      },
      colors: {
        border: emailDesignTokens.colors.border,
        foreground: emailDesignTokens.colors.foreground,
        muted: {
          foreground: emailDesignTokens.colors.mutedForeground,
        },
        primary: {
          DEFAULT: emailDesignTokens.colors.primary,
          "dark-1": emailDesignTokens.colors.primaryDark,
        },
        accent: {
          DEFAULT: emailDesignTokens.colors.accent,
        },
        secondary: {
          DEFAULT: emailDesignTokens.colors.secondary,
        },
      },
    },
  },
}
