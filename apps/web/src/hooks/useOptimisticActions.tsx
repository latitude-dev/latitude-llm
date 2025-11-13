import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast, ToastAction } from '@latitude-data/web-ui/atoms/Toast'

function UndoCountdownLabel({ timeoutMs }: { timeoutMs: number }) {
  const [seconds, setSeconds] = useState(timeoutMs / 1000)

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [timeoutMs])

  return <>{seconds < 1 ? 'Undo' : `Undo (${seconds})`}</>
}

export function useOptimisticAction<T = void>({
  onOptimistic,
  onUndo,
  undoTimeoutMs,
  undoToast,
}: {
  undoTimeoutMs: number
  undoToast: {
    title: string
    description: string
  }
  onOptimistic: (action: T) => void
  onUndo: (action: T) => void
}) {
  const { toast, dismiss } = useToast()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastIdRef = useRef<string | null>(null)
  const doOptimisticAction = useCallback(
    (action: T) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }

      if (toastIdRef.current) {
        dismiss(toastIdRef.current)
        toastIdRef.current = null
      }

      onOptimistic(action)

      const t = toast({
        variant: 'accent',
        title: undoToast.title,
        description: undoToast.description,
        action: (
          <ToastAction
            altText='Undo action'
            onClick={() => {
              // Cancel commit timeout
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
                timeoutRef.current = null
              }
              onUndo(action)
            }}
          >
            <UndoCountdownLabel timeoutMs={undoTimeoutMs} />
          </ToastAction>
        ),
      })

      toastIdRef.current = t.id

      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        dismiss(t.id)
      }, undoTimeoutMs)
    },
    [onOptimistic, onUndo, undoTimeoutMs, undoToast, toast, dismiss],
  )

  return useMemo(() => ({ doOptimisticAction }), [doOptimisticAction])
}
