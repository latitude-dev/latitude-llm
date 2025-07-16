export const createPromiseWithResolver = <T>(): readonly [
  Promise<T>,
  (value: T) => void,
] => {
  let resolveValue: (value: T) => void
  const promisedValue = new Promise<T>((resolve) => {
    resolveValue = (value) => {
      resolve(value)
    }
  })

  return [promisedValue, resolveValue!] as const
}
