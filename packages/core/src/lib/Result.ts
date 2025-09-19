export class Ok<V> {
  public readonly error: undefined = undefined

  constructor(public readonly value: V) {}

  public bind<T>(fn: (value: V) => T): T {
    return fn(this.value)
  }

  public unwrap(): V {
    if (this.value instanceof Ok) return this.value.unwrap()
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
    if (this.error instanceof ErrorResult) this.error.unwrap()
    throw this.error
  }

  public get ok(): boolean {
    return false
  }
}

export type TypedResult<V = undefined, E extends Error = Error> =
  | Ok<V>
  | ErrorResult<E>

export type OkType<F extends (...args: any) => any> =
  Awaited<ReturnType<F>> extends TypedResult<infer V, any> ? V : never

export type ErrorType<F extends (...args: any) => any> =
  Awaited<ReturnType<F>> extends TypedResult<any, infer E> ? E : never

export class Result {
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

  public static findError<E extends Error>(
    results: TypedResult<any, E>[],
  ): ErrorResult<E> | undefined {
    return results.find((r) => !r.ok) as ErrorResult<E> | undefined
  }

  public static includesAnError<E extends Error>(
    results: TypedResult<any, E>[],
  ): boolean {
    return results.some((r) => !r.ok)
  }
}
