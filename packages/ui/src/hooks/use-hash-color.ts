import { useMemo } from "react"

function hashToHue(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(31, hash) + text.charCodeAt(i)
    hash |= 0
  }
  return ((hash % 360) + 360) % 360
}

export { hashToHue }

/**
 * Deterministic color scheme derived from a text string.
 *
 * Returns a `style` object (with light-mode colors and dark-mode CSS custom
 * properties) and a `className` string that activates the dark overrides.
 * Spread both onto the target element:
 *
 * ```tsx
 * const { style, className } = useHashColor('hello')
 * <span style={style} className={cn('…', className)}>…</span>
 * ```
 */
export function useHashColor(text: string) {
  return useMemo(() => {
    const hue = hashToHue(text)
    return {
      style: {
        backgroundColor: `hsl(${hue} 50% 92%)`,
        color: `hsl(${hue} 40% 35%)`,
        "--hash-bg": `hsl(${hue} 30% 20%)`,
        "--hash-fg": `hsl(${hue} 40% 75%)`,
      } as React.CSSProperties,
      className: "dark:bg-(--hash-bg)! dark:text-(--hash-fg)!",
    }
  }, [text])
}
