import { useCallback, useState } from 'react'
import DiffMatchPatch from 'diff-match-patch'

const dmp = new DiffMatchPatch()

const MAX_ANIMATION_TIME = 5000
const STEP_DURATION = 5

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
      setCustomReadOnlyMessage(
        'Latte is updating the document. Please wait for it to finish.',
      )

      const diffs = dmp.diff_main(value, newValue)
      dmp.diff_cleanupEfficiency(diffs)

      const totalCharacterChanges = diffs.reduce((acc, [op, text]) => {
        if (op === DiffMatchPatch.DIFF_EQUAL) return acc
        return acc + text.length
      }, 0)

      const chunkSize = Math.floor(
        totalCharacterChanges / (MAX_ANIMATION_TIME / STEP_DURATION),
      )

      let cursor = 0
      let currentValue = value
      let diffIndex = 0
      let charIndex = 0

      const updateStep = () => {
        if (diffIndex >= diffs.length) {
          setValue(newValue)
          setCustomReadOnlyMessage(undefined)
          setHighlightedCursorIndex(undefined)
          return
        }

        const [op, text] = diffs[diffIndex]!

        if (op === DiffMatchPatch.DIFF_EQUAL) {
          cursor += text.length
          diffIndex++
          charIndex = 0
          return updateStep()
        }

        const stepChunkLength = Math.min(text.length - charIndex, chunkSize)

        if (op === DiffMatchPatch.DIFF_DELETE) {
          currentValue =
            currentValue.slice(0, cursor) +
            currentValue.slice(cursor + stepChunkLength)
        } else if (op === DiffMatchPatch.DIFF_INSERT) {
          currentValue =
            currentValue.slice(0, cursor) +
            text.slice(charIndex, charIndex + stepChunkLength) +
            currentValue.slice(cursor)
          cursor += stepChunkLength
        }

        charIndex += stepChunkLength
        if (charIndex >= text.length) {
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
    streamLatteUpdate,
  }
}
