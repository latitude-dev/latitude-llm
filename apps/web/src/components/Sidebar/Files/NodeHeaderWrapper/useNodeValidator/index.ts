import {
  ChangeEventHandler,
  KeyboardEvent,
  RefObject,
  useCallback,
  useState,
} from 'react'
import { useOnClickOutside } from '@latitude-data/web-ui/hooks/useOnClickOutside'
import { DOCUMENT_PATH_REGEXP } from '@latitude-data/constants'

const INVALID_MSG =
  "Invalid path, no spaces. Only letters, numbers, '.', '-' and '_'"

export function useNodeValidator({
  name,
  inputRef,
  isEditing,
  setIsEditing,
  leaveWithoutSave,
  saveValue,
  saveAndAddOther,
}: {
  name: string | undefined
  inputRef: RefObject<HTMLInputElement>
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
      const isValid = DOCUMENT_PATH_REGEXP.test(value)

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

    const isValid = DOCUMENT_PATH_REGEXP.test(value)
    if (!isValid) return

    await saveValue({ path: value })
    setIsEditing(false)
  }, [inputRef, saveValue, leaveWithoutSave, setIsEditing])

  useOnClickOutside({
    ref: inputRef,
    handler: onClickOutside,
    enabled: isEditing,
  })

  const onInputKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLInputElement>) => {
      const val = inputRef.current?.value ?? ''
      const value = val.trim()
      const isValid = DOCUMENT_PATH_REGEXP.test(value)
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
    [saveValue, leaveWithoutSave, inputRef, setIsEditing, saveAndAddOther],
  )

  return {
    inputValue,
    isEditing,
    onInputChange,
    onInputKeyDown,
    error: validationError,
  }
}
