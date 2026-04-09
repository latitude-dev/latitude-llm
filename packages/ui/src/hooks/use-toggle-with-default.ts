import { useCallback, useState } from "react"

/**
 * A toggle hook that follows a dynamic default value but allows user override.
 *
 * ## Why use this?
 *
 * When you have a boolean state that should:
 * 1. Follow an external/computed default (e.g., from route config, props, or context)
 * 2. Allow the user to override it (e.g., via button click or keyboard shortcut)
 * 3. Reset to the new default when the external value changes
 *
 * This pattern avoids useEffect for syncing state with props, using React's
 * recommended approach of detecting prop changes during render.
 *
 * ## Example: Sidebar that auto-collapses on certain routes
 *
 * ```tsx
 * function Sidebar() {
 *   // Some routes set staticData.collapseSidebar = true
 *   const autoCollapse = useShouldCollapseSidebar()
 *
 *   // Sidebar follows autoCollapse, but user can toggle it
 *   // When navigating to a different route, resets to new default
 *   const [collapsed, toggleCollapsed] = useToggleWithDefault(autoCollapse)
 *
 *   return (
 *     <div className={collapsed ? "w-16" : "w-64"}>
 *       <button onClick={toggleCollapsed}>Toggle</button>
 *     </div>
 *   )
 * }
 * ```
 *
 * ## Behavior
 *
 * - Returns `defaultValue` until user explicitly toggles
 * - After toggle, returns user's choice regardless of `defaultValue`
 * - When `defaultValue` changes, resets user override (follows new default)
 *
 * @param defaultValue - The external/computed default to follow
 * @returns Tuple of [currentValue, toggleFn]
 */
export function useToggleWithDefault(defaultValue: boolean): [boolean, () => void] {
  const [userOverride, setUserOverride] = useState<boolean | null>(null)
  const [prevDefault, setPrevDefault] = useState(defaultValue)

  if (prevDefault !== defaultValue) {
    setPrevDefault(defaultValue)
    setUserOverride(null)
  }

  const value = userOverride ?? defaultValue

  const toggle = useCallback(() => {
    setUserOverride((prev) => !(prev ?? defaultValue))
  }, [defaultValue])

  return [value, toggle]
}
