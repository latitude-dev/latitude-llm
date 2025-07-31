import { useCallback, useMemo, useState } from 'react'

export function useToggleModal({
  initialState = false,
}: { initialState?: boolean } = {}) {
  const [open, setOpen] = useState(initialState)
  const onClose = useCallback(() => setOpen(false), [])
  const onOpen = useCallback(() => setOpen(true), [])
  const onOpenChange = useCallback(
    (newOpen?: boolean) => setOpen((prev) => newOpen ?? !prev),
    [],
  )

  return useMemo(
    () => ({ open, onClose, onOpen, onOpenChange }),
    [open, onClose, onOpen, onOpenChange],
  )
}
