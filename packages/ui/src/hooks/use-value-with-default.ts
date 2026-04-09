import { useCallback, useState } from "react"

type Primitive = string | number | boolean | null | undefined

/**
 * A state hook that follows a dynamic default value but allows user override.
 *
 * ## Why use this?
 *
 * When you have local edit state that should:
 * 1. Follow an external/server value (e.g., from props, API response)
 * 2. Allow the user to edit it locally
 * 3. Reset to the new external value when it changes (e.g., after refetch)
 *
 * This pattern avoids useEffect for syncing state with props, using React's
 * recommended approach of detecting prop changes during render.
 *
 * ## Example: Form field that syncs with server data
 *
 * ```tsx
 * function AnnotationEditor({ annotation }: { annotation: AnnotationRecord }) {
 *   // localComment follows annotation.feedback but can be edited locally
 *   // When annotation changes (refetch), resets to new server value
 *   const [localComment, setLocalComment] = useValueWithDefault(annotation.feedback ?? "")
 *
 *   return (
 *     <textarea
 *       value={localComment}
 *       onChange={(e) => setLocalComment(e.target.value)}
 *     />
 *   )
 * }
 * ```
 *
 * ## Behavior
 *
 * - Returns `defaultValue` until user explicitly sets a value
 * - After set, returns user's value regardless of `defaultValue`
 * - When `defaultValue` changes, resets user override (follows new default)
 *
 * @param defaultValue - The external/computed default to follow
 * @returns Tuple of [currentValue, setValueFn]
 */
export function useValueWithDefault<T extends Primitive>(defaultValue: T): [T, (value: T) => void] {
  const [userOverride, setUserOverride] = useState<T | null>(null)
  const [prevDefault, setPrevDefault] = useState(defaultValue)

  if (prevDefault !== defaultValue) {
    setPrevDefault(defaultValue)
    setUserOverride(null)
  }

  const value = userOverride ?? defaultValue

  const setValue = useCallback((newValue: T) => {
    setUserOverride(newValue)
  }, [])

  return [value, setValue]
}
