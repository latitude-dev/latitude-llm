import { useCallback, useRef, useState } from "react"

export function useHover<T extends HTMLElement = HTMLElement>(): [ref: (node: T | null) => void, hovered: boolean] {
  const [hovered, setHovered] = useState(false)
  const prevNodeRef = useRef<T | null>(null)
  const onEnter = useRef(() => setHovered(true))
  const onLeave = useRef(() => setHovered(false))

  const callbackRef = useCallback((node: T | null) => {
    if (prevNodeRef.current) {
      prevNodeRef.current.removeEventListener("mouseenter", onEnter.current)
      prevNodeRef.current.removeEventListener("mouseleave", onLeave.current)
    }

    if (node) {
      node.addEventListener("mouseenter", onEnter.current)
      node.addEventListener("mouseleave", onLeave.current)
    } else {
      setHovered(false)
    }

    prevNodeRef.current = node
  }, [])

  return [callbackRef, hovered]
}
