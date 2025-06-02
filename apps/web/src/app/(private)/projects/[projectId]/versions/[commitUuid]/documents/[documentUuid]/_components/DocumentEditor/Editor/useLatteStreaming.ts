import { useCallback, useState } from 'react'

function lastCommonIndex(s1: string, s2: string): number {
  const minLen = Math.min(s1.length, s2.length)
  for (let i = 0; i < minLen; i++) {
    if (s1[i] !== s2[i]) {
      return i - 1
    }
  }
  return minLen - 1
}

export function useLatteStreaming({
  value,
  setValue,
}: {
  value: string
  setValue: (value: string) => void
}) {
  const [customReadOnlyMessage, setCustomReadOnlyMessage] = useState<string>()
  const [highlightedCursorIndex, setHighlightedCursorIndex] = useState<number>()

  const streamLatteUpdate = useCallback(
    (newValue: string) => {
      let index = lastCommonIndex(value, newValue)
      setCustomReadOnlyMessage(
        'Latte is updating the document. Please wait for it to finish.',
      )
      const update = () => {
        const restOfOldValue = value.slice(index + 1)
        const restOfNewValue = newValue.slice(index + 1)

        if (index >= newValue.length || restOfOldValue === restOfNewValue) {
          setValue(newValue)
          setCustomReadOnlyMessage(undefined)
          setHighlightedCursorIndex(undefined)
          return
        }

        const mergedValue = newValue.slice(0, index + 1) + restOfOldValue
        index++

        setValue(mergedValue)
        setHighlightedCursorIndex(index)

        setTimeout(update, 2) // Update every 2ms
      }

      update()
    },
    [value, setValue],
  )

  return {
    customReadOnlyMessage,
    highlightedCursorIndex,
    streamLatteUpdate,
  }
}
