import { useEffect, useRef } from 'react'

export function useMount(callback: () => void) {
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true

    callback()
  }, [callback])
}
