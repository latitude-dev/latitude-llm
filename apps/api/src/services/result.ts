export class Ok<V> {
  public readonly error: undefined = undefined

  constructor(public readonly value: V) {}

  public bind<T>(fn: (value: V) => T): T {
    return fn(this.value)
  }

  public unwrap(): V {
    return this.value
  }

  public get ok(): boolean {
    return true
  }
}

export class ErrorResult<E extends Error> {
  public readonly value: undefined = undefined

  constructor(public readonly error: E) {}

  public bind(): ErrorResult<E> {
    return this
  }

  public unwrap(): never {
    throw this.error
  }

  public get ok(): boolean {
    return false
  }
}

export type TypedResult<V, E extends Error> = Ok<V> | ErrorResult<E>

export default class Result {
  private constructor() {}

  public static ok<V>(value: V): Ok<V> {
    return new Ok(value)
  }

  public static nil(): Ok<undefined> {
    return new Ok(undefined)
  }

  public static error<E extends Error>(error: E): ErrorResult<E> {
    return new ErrorResult(error)
  }

  public static isOk<V>(result: TypedResult<V, Error>): result is Ok<V> {
    return result.ok
  }
}
