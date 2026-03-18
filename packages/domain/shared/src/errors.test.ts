import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  BadRequestError,
  ConflictError,
  defineError,
  defineErrorDynamic,
  NotFoundError,
  PermissionError,
  RepositoryError,
  UnauthorizedError,
  ValidationError,
} from "./errors.ts"

const isHttpError = (error: unknown): error is { httpStatus: number; httpMessage: string } =>
  typeof error === "object" &&
  error !== null &&
  "httpStatus" in error &&
  typeof (error as any).httpStatus === "number" &&
  "httpMessage" in error &&
  typeof (error as any).httpMessage === "string"

describe("defineError", () => {
  it("produces instances with static httpStatus and httpMessage", () => {
    const err = new RepositoryError({ cause: "timeout", operation: "findById" })
    expect(err._tag).toBe("RepositoryError")
    expect(err.httpStatus).toBe(500)
    expect(err.httpMessage).toBe("Internal server error")
    expect(err.cause).toBe("timeout")
    expect(err.operation).toBe("findById")
    expect(isHttpError(err)).toBe(true)
  })

  it("supports custom static errors via defineError", () => {
    class MyStaticError extends defineError("MyStaticError", 502, "Bad gateway")<{
      readonly detail: string
    }> {}

    const err = new MyStaticError({ detail: "upstream timeout" })
    expect(err._tag).toBe("MyStaticError")
    expect(err.httpStatus).toBe(502)
    expect(err.httpMessage).toBe("Bad gateway")
    expect(err.detail).toBe("upstream timeout")
    expect(isHttpError(err)).toBe(true)
    expect(err instanceof MyStaticError).toBe(true)
  })
})

describe("defineErrorDynamic", () => {
  it("produces instances with dynamic httpMessage", () => {
    const err = new NotFoundError({ entity: "Project", id: "abc123" })
    expect(err._tag).toBe("NotFoundError")
    expect(err.httpStatus).toBe(404)
    expect(err.httpMessage).toBe("Project not found")
    expect(err.entity).toBe("Project")
    expect(err.id).toBe("abc123")
    expect(isHttpError(err)).toBe(true)
  })

  it("computes httpMessage from fields for ValidationError", () => {
    const err = new ValidationError({ field: "email", message: "Invalid email format" })
    expect(err.httpStatus).toBe(400)
    expect(err.httpMessage).toBe("Invalid email format")
  })

  it("computes httpMessage from fields for ConflictError", () => {
    const err = new ConflictError({ entity: "User", field: "email", value: "foo@bar.com" })
    expect(err.httpStatus).toBe(409)
    expect(err.httpMessage).toBe("User with email 'foo@bar.com' already exists")
  })

  it("computes httpMessage from fields for UnauthorizedError", () => {
    const err = new UnauthorizedError({ message: "Token expired" })
    expect(err.httpStatus).toBe(401)
    expect(err.httpMessage).toBe("Token expired")
  })

  it("computes httpMessage from fields for BadRequestError", () => {
    const err = new BadRequestError({ message: "Missing required field" })
    expect(err.httpStatus).toBe(400)
    expect(err.httpMessage).toBe("Missing required field")
  })

  it("computes httpMessage from fields for PermissionError", () => {
    const err = new PermissionError({ message: "Forbidden", organizationId: "org1" })
    expect(err.httpStatus).toBe(403)
    expect(err.httpMessage).toBe("Forbidden")
  })
})

describe("Effect integration", () => {
  it("errors are yieldable in Effect.gen", async () => {
    const program = Effect.gen(function* () {
      return yield* new NotFoundError({ entity: "Project", id: "abc123" })
    })

    const exit = await Effect.runPromiseExit(program)
    expect(exit._tag).toBe("Failure")
  })

  it("errors are catchable by _tag", async () => {
    const program = Effect.gen(function* () {
      return yield* new NotFoundError({ entity: "Project", id: "abc123" })
    }).pipe(Effect.catchTag("NotFoundError", (err) => Effect.succeed(`caught: ${err.entity}`)))

    const result = await Effect.runPromise(program)
    expect(result).toBe("caught: Project")
  })
})
