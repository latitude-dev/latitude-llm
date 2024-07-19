export type ExtendsUnion<T, U extends T> = U

export function hasOwnProperty<
  R,
  T extends object | undefined,
  K extends PropertyKey,
>(obj: T = {} as T, prop: K): obj is T & Record<K, R> {
  return Object.prototype.hasOwnProperty.call(obj || {}, prop)
}