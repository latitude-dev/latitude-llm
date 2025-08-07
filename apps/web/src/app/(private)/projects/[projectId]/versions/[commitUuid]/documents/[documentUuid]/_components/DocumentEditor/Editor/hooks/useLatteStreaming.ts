import { customDiff, CustomDiffType } from '$/helpers/latte/customDiff'
import { useCallback, useRef, useState } from 'react'

const MAX_ANIMATION_TIME = 5000
const STEP_DURATION = 4

export function useLatteStreaming({
  value,
  setValue,
}: {
  value: string
  setValue: (value: string) => void
}) {
  const isStreamingRef = useRef<boolean>(false)
  const [customReadOnlyMessage, setCustomReadOnlyMessage] = useState<string>()
  const [highlightedCursorIndex, setHighlightedCursorIndex] = useState<number>()

  const streamLatteUpdate = useCallback(
    (newValue: string) => {
      isStreamingRef.current = true
      setCustomReadOnlyMessage(
        'Latte is updating the document. Please wait for it to finish.',
      )

      const diffs = customDiff(value, newValue)

      const totalCharacterChanges = diffs.reduce(
        (acc, diff) => acc + diff.length,
        0,
      )
      const chunkSize = Math.ceil(
        totalCharacterChanges / (MAX_ANIMATION_TIME / STEP_DURATION),
      )

      let cursor = 0 // Current position in the prompt
      let currentValue = value // Currently displayed value

      let diffIndex = 0 // Current index in the diffs array
      let charIndex = 0 // Current character index in the current diff

      const updateStep = () => {
        if (diffIndex >= diffs.length) {
          // Finished processing all diffs
          setValue(newValue)
          setCustomReadOnlyMessage(undefined)
          setHighlightedCursorIndex(undefined)
          isStreamingRef.current = false
          return
        }

        const diff = diffs[diffIndex]!

        if (diff.type === CustomDiffType.EQUAL) {
          // Skip equal parts
          cursor += diff.length
          diffIndex++
          charIndex = 0
          return updateStep()
        }

        const stepChunkLength = Math.min(diff.length - charIndex, chunkSize)

        if (diff.type === CustomDiffType.DELETE) {
          currentValue =
            currentValue.slice(0, cursor) +
            currentValue.slice(cursor + stepChunkLength)
        } else if (diff.type === CustomDiffType.INSERT) {
          currentValue =
            currentValue.slice(0, cursor) +
            diff.text.slice(charIndex, charIndex + stepChunkLength) +
            currentValue.slice(cursor)

          cursor += stepChunkLength
        } else if (diff.type === CustomDiffType.REPLACE) {
          currentValue =
            currentValue.slice(0, cursor) +
            diff.text.slice(charIndex, charIndex + stepChunkLength) +
            currentValue.slice(cursor + stepChunkLength)

          cursor += stepChunkLength
        }

        charIndex += stepChunkLength
        if (charIndex >= diff.length) {
          diffIndex++
          charIndex = 0
        }

        setValue(currentValue)
        setHighlightedCursorIndex(cursor)

        setTimeout(updateStep, STEP_DURATION)
      }

      updateStep()
    },
    [value, setValue],
  )

  return {
    customReadOnlyMessage,
    highlightedCursorIndex,
    isStreamingRef,
    streamLatteUpdate,
  }
}
