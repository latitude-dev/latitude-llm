import { useState } from 'react'

export function useRunBatchLineOptions() {
  const [wantAllLines, setAllRows] = useState(true)
  const [fromLine, setFromLine] = useState<number>(1)
  const [toLine, setToLine] = useState<number | undefined>(undefined)
  const [autoRespondToolCalls, setAutoRespondToolCalls] = useState(true)
  return {
    wantAllLines,
    setAllRows,
    fromLine,
    toLine,
    setFromLine,
    setToLine,
    autoRespondToolCalls,
    setAutoRespondToolCalls,
  }
}
