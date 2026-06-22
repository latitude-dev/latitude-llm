export const emailDesignTokens = {
  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fonts: {
    /** Serif stack used by the Claude Code Wrapped template. Georgia is the
     *  most-installed serif across mail clients, so we don't need @font-face. */
    serif: 'Georgia, "Times New Roman", "Source Serif Pro", serif',
    /** Same as fontFamily — kept here as a token so templates can reference it. */
    sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  colors: {
    border: "#E5E5E5",
    foreground: "#030712",
    mutedForeground: "#545E69",
    primary: "#0080FF",
    primaryForeground: "#F8FAFB",
    input: "#D8D8D8",
    accent: "#EFF7FF",
    secondary: "#F9FAFB",
    white: "#FFFFFF",
    /** Anthropic / Claude Code branding tokens — scoped here, not used by the
     *  default ContainerLayout. The Wrapped template opts in. */
    claude: {
      accent: "#D97555",
      accentForegroundOnLight: "#0F0F0F",
      accentForegroundOnDark: "#FFFFFF",
      cream: "#F0EEE6",
      creamDeep: "#E8E4D8",
      ink: "#1A1A1A",
      mutedInk: "#5C5C5C",
    },
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
  shadows: {
    button: "0 1px 2px 0 rgb(0 0 0 / 0.05), inset 0 3px 8px 0 rgb(255 255 255 / 0.48)",
  },
  button: {
    borderRadius: "0.5rem",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    fontWeight: 500,
    padding: "5px 12px",
  },
} as const

export function emailButtonStyle(variant: "default" | "outline" = "default") {
  const base = {
    fontFamily: emailDesignTokens.fontFamily,
    display: "inline-block" as const,
    textAlign: "center" as const,
    textDecoration: "none",
    borderRadius: emailDesignTokens.button.borderRadius,
    fontSize: emailDesignTokens.button.fontSize,
    lineHeight: emailDesignTokens.button.lineHeight,
    fontWeight: emailDesignTokens.button.fontWeight,
    padding: emailDesignTokens.button.padding,
  }

  if (variant === "outline") {
    return {
      ...base,
      backgroundColor: emailDesignTokens.colors.white,
      color: emailDesignTokens.colors.foreground,
      border: `1px solid ${emailDesignTokens.colors.input}`,
    }
  }

  return {
    ...base,
    backgroundColor: emailDesignTokens.colors.primary,
    color: emailDesignTokens.colors.primaryForeground,
    boxShadow: emailDesignTokens.shadows.button,
  }
}

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
          foreground: emailDesignTokens.colors.primaryForeground,
        },
        input: emailDesignTokens.colors.input,
        accent: {
          DEFAULT: emailDesignTokens.colors.accent,
        },
        secondary: {
          DEFAULT: emailDesignTokens.colors.secondary,
        },
        claude: {
          accent: emailDesignTokens.colors.claude.accent,
          cream: emailDesignTokens.colors.claude.cream,
          "cream-deep": emailDesignTokens.colors.claude.creamDeep,
          ink: emailDesignTokens.colors.claude.ink,
          "muted-ink": emailDesignTokens.colors.claude.mutedInk,
        },
      },
    },
  },
}
