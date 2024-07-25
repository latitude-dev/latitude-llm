import {
  ChangeEventHandler,
  KeyboardEvent,
  RefObject,
  useCallback,
  useEffect,
  useState,
} from 'react'

import { Node as SidebarNode } from '$ui/sections/Document/Sidebar/Files/useTree'

function useOnClickOutside<E extends HTMLElement>({
  enabled,
  ref,
  handler,
}: {
  enabled: boolean
  ref: RefObject<E>
  handler: (event: MouseEvent | TouchEvent) => void
}) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!(event.target instanceof Node)) return

      const insideWrapper = ref.current?.contains?.(event.target)
      if (insideWrapper) return

      handler(event)
    }

    if (!enabled) return

    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)

    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [ref, handler, enabled])
}

const PATH_REGEXP = /^([\w-]+\/)*([\w-.])+$/
const INVALID_MSG =
  "Invalid path, no spaces. Only letters, numbers, '-' and '_'"
export function useNodeValidator({
  node,
  inputRef,
  nodeRef,
  leaveWithoutSave,
  saveValue,
}: {
  node: SidebarNode
  inputRef: RefObject<HTMLInputElement>
  nodeRef: RefObject<HTMLDivElement>
  saveValue: (args: { path: string }) => Promise<void>
  leaveWithoutSave?: () => void
}) {
  const [isEditing, setIsEditing] = useState(node.name === ' ')
  const [validationError, setError] = useState<string>()
  const onInputChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      const value = event.target.value
      const isValid = PATH_REGEXP.test(value)

      let error = undefined

      if (!isValid) {
        error = INVALID_MSG
      }

      setError(error)
    },
    [setError],
  )
  const onClickOutside = useCallback(async () => {
    const val = inputRef.current?.value ?? ''
    const value = val.trim()

    if (!value) {
      leaveWithoutSave?.()
      return
    }

    const isValid = PATH_REGEXP.test(value)
    if (!isValid) return

    await saveValue({ path: value })
    setIsEditing(false)
  }, [inputRef, validationError, saveValue, leaveWithoutSave])

  useOnClickOutside({
    ref: nodeRef,
    handler: onClickOutside,
    enabled: isEditing,
  })

  const onInputKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLInputElement>) => {
      const val = inputRef.current?.value ?? ''
      const value = val.trim()
      const isValid = PATH_REGEXP.test(value)

      if (event.key === 'Escape') {
        leaveWithoutSave?.()
      } else if (event.key === 'Enter' && isValid) {
        await saveValue({ path: value })
        setIsEditing(false)
      }
    },
    [saveValue, leaveWithoutSave, inputRef, setIsEditing],
  )

  return {
    isEditing,
    onInputChange,
    onInputKeyDown,
    error: validationError,
  }
}
