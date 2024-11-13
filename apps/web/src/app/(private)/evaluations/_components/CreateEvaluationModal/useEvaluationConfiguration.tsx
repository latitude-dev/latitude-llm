import { ChangeEvent, useCallback, useEffect, useState } from 'react'

import {
  EvaluationResultableType,
  EvaluationResultConfiguration,
} from '@latitude-data/core/browser'

export function useEvaluationConfiguration(
  init?: EvaluationResultConfiguration,
) {
  const [configuration, setConfiguration] =
    useState<EvaluationResultConfiguration>(
      init || {
        type: EvaluationResultableType.Text,
      },
    )

  const handleTypeChange = useCallback((value: EvaluationResultableType) => {
    if (value === EvaluationResultableType.Number) {
      setConfiguration({
        type: value,
        detail: { range: { from: 1, to: 5 } },
      })
    } else {
      setConfiguration({ type: value })
    }
  }, [])

  const handleRangeFromChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setConfiguration((prev) => {
        const next = { ...prev }
        const value = e.target.value

        if (value === '') {
          next.detail = {
            range: { from: 0, to: next.detail?.range.to || 0 },
          }
          return next
        }

        const from = parseInt(value)
        if (next.detail?.range) {
          next.detail.range.from = from
          if (from > next.detail.range.to) {
            next.detail.range.to = from + 1
          }
        } else {
          next.detail = {
            range: { from, to: from + 1 },
          }
        }

        return next
      })
    },
    [],
  )

  const handleRangeToChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setConfiguration((prev) => {
        const next = { ...prev }
        const value = e.target.value

        if (value === '') {
          next.detail = {
            range: { from: 0, to: 0 },
          }
          return next
        }

        const to = parseInt(value)
        if (next.detail?.range) {
          next.detail.range.to = to
          if (to < next.detail.range.from) {
            next.detail.range.from = to - 1
          }
        } else {
          next.detail = {
            range: { from: to - 1, to },
          }
        }

        return next
      })
    },
    [],
  )

  useEffect(() => {
    if (!init) return

    setConfiguration(init)
  }, [init])

  return {
    configuration,
    handleTypeChange,
    handleRangeFromChange,
    handleRangeToChange,
  }
}
