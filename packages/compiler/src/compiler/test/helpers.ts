import { expect } from 'vitest'

export async function getExpectedError<T>(
  action: () => Promise<unknown>,
  errorClass: new () => T,
): Promise<T> {
  try {
    await action()
  } catch (err) {
    expect(err).toBeInstanceOf(errorClass)
    return err as T
  }
  throw new Error('Expected an error to be thrown')
}
