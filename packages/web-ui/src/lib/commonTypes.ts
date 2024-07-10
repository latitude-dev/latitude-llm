import type { Dispatch, SetStateAction } from 'react'

export type ExtendsUnion<T, U extends T> = U
export type ReactStateDispatch<T> = Dispatch<SetStateAction<T>>
export function hasOwnProperty<T, K extends PropertyKey>(
  obj: T,
  prop: K,
): obj is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(obj || {}, prop)
}
