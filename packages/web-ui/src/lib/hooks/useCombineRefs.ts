import { ForwardedRef, useCallback, useRef } from 'react'

type OptionalRef<T> = ForwardedRef<T> | undefined

function setRef<T>(ref: OptionalRef<T>, value: T) {
  if (typeof ref === 'function') {
    ref(value)
  } else if (ref) {
    ref.current = value
  }
}

export function useCombinedRefs<T>(...refs: OptionalRef<T>[]) {
  const previousRefs = useRef<OptionalRef<T>[]>([])

  return useCallback((value: T | null) => {
    let index = 0
    for (; index < refs.length; index++) {
      const ref = refs[index]
      const prev = previousRefs.current[index]

      if (prev != ref) setRef(prev, null)

      setRef(ref, value)
    }

    for (; index < previousRefs.current.length; index++) {
      const prev = previousRefs.current[index]
      setRef(prev, null)
    }

    previousRefs.current = refs
  }, refs)
}
