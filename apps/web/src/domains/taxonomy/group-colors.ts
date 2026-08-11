/**
 * Cycles through the same categorical ramp the cost dashboard uses for its model
 * series (`cost-series-colors.ts`), so a group keeps one color between the
 * facet's share bar and its own row's dot. That file renders through echarts'
 * canvas, which can't resolve CSS custom properties — hence literal oklch values
 * there — but these are plain DOM elements, so the equivalent Tailwind shades
 * with a `dark:` variant give the same ramp without needing an isDark hook.
 * Static literals, not a template-built class name: Tailwind's scanner needs
 * every class it generates to appear verbatim in source.
 */
const GROUP_COLOR_CLASSES = [
  "bg-blue-400 dark:bg-blue-600",
  "bg-violet-400 dark:bg-violet-600",
  "bg-fuchsia-400 dark:bg-fuchsia-600",
  "bg-teal-400 dark:bg-teal-600",
  "bg-amber-400 dark:bg-amber-600",
  "bg-red-400 dark:bg-red-600",
  "bg-sky-400 dark:bg-sky-600",
  "bg-lime-400 dark:bg-lime-600",
] as const

export const groupColorClassAt = (index: number): string => GROUP_COLOR_CLASSES[index % GROUP_COLOR_CLASSES.length]
