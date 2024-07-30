import type { Dispatch } from 'react'

export type ReactStateDispatch<T> = Dispatch<SetStateAction<T>>
export type SetStateAction<T> = T | ((prevState: T) => T)
