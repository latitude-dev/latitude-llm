import {
  ChangeEventHandler,
  KeyboardEvent,
  RefObject,
  useCallback,
  useEffect,
  useState,
} from 'react'

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
  name,
  inputRef,
  nodeRef,
  isEditing,
  setIsEditing,
  leaveWithoutSave,
  saveValue,
  saveAndAddOther,
}: {
  name: string | undefined
  inputRef: RefObject<HTMLInputElement>
  nodeRef: RefObject<HTMLDivElement>
  isEditing: boolean
  setIsEditing: (isEditing: boolean) => void
  saveValue: (args: { path: string }) => Promise<void> | void
  saveAndAddOther?: (args: { path: string }) => void
  leaveWithoutSave?: () => void
}) {
  const [validationError, setError] = useState<string>()
  const [inputValue, setInputValue] = useState(name)
  const onInputChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      const value = event.target.value
      const isValid = PATH_REGEXP.test(value)

      let error = undefined

      if (!isValid) {
        error = INVALID_MSG
      }

      setError(error)
      setInputValue(value)
    },
    [setError, setInputValue],
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
      const key = event.key

      if (key === 'Escape') {
        leaveWithoutSave?.()
      } else if (key === 'Tab') {
        event.preventDefault()
        if (!isValid) return

        saveAndAddOther?.({ path: value })
        setIsEditing(false)
      } else if (event.key === 'Enter' && isValid) {
        await saveValue({ path: value })
        setIsEditing(false)
      }
    },
    [saveValue, leaveWithoutSave, inputRef, setIsEditing],
  )

  return {
    inputValue,
    isEditing,
    onInputChange,
    onInputKeyDown,
    error: validationError,
  }
}
