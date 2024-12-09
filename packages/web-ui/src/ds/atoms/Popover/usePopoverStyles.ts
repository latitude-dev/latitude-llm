import { RefObject, useRef, useState } from 'react'

const PADDING_OVER_TRIGGER = 8

type ReturnType = {
  ref: RefObject<HTMLDivElement>
  isOpen: boolean
  width: number
  offset: number
  alignOffset: number
  onSizeChange: (open: boolean) => void
}
export function usePopoverStyles(): ReturnType {
  const ref = useRef<HTMLDivElement>(null)
  const [isOpen, setOpen] = useState(false)
  const [width, setWidth] = useState(0)
  const [offset, setOffset] = useState(0)
  const [alignOffset, setAlignOffset] = useState(0)

  const onSizeChange = (open: boolean) => {
    if (!ref.current) return

    setOpen(open)
    setWidth(ref.current.offsetWidth + PADDING_OVER_TRIGGER * 2)
    setAlignOffset(-PADDING_OVER_TRIGGER)
    setOffset(-ref.current.offsetHeight - PADDING_OVER_TRIGGER)
  }

  return { width, offset, alignOffset, isOpen, onSizeChange, ref }
}
