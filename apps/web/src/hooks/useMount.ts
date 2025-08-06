import { useEffect, useRef } from 'react'

export function useOnce(callback: () => void, enabled = true) {
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current || !enabled) return
    mounted.current = true

    callback()
  }, [callback, enabled])
}
