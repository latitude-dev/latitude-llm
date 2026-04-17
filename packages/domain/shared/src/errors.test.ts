import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  PermissionError,
  RepositoryError,
  UnauthorizedError,
  ValidationError,
} from "./errors.ts"

describe("static httpStatus and httpMessage", () => {
  it("RepositoryError", () => {
    const err = new RepositoryError({ cause: "timeout", operation: "findById" })
    expect(err._tag).toBe("RepositoryError")
    expect(err.httpStatus).toBe(500)
    expect(err.httpMessage).toBe("Internal server error")
    expect(err.message).toBe("Repository findById failed: timeout")
    expect(err.cause).toBe("timeout")
    expect(err.operation).toBe("findById")
  })

  it("reuses the wrapped error stack when cause is an Error", () => {
    const cause = new Error("query failed")

    cause.stack = [
      "Error: query failed",
      "at query (file:///app/packages/platform/db-clickhouse/src/ch-sql-client.ts:12:9)",
    ].join("\n")

    const err = new RepositoryError({ cause, operation: "findById" })

    expect(err.stack).toBe(cause.stack)
  })

  it("includes nested cause messages for wrapped database errors", () => {
    const postgresError = new Error('null value in column "aligned_at" violates not-null constraint')
    const drizzleError = new Error("Failed query: insert into evaluations ...\nparams: ...")
    drizzleError.cause = postgresError

    const err = new RepositoryError({ cause: drizzleError, operation: "save" })

    expect(err.message).toBe(
      'Repository save failed: Failed query: insert into evaluations ...\nparams: ... Caused by: null value in column "aligned_at" violates not-null constraint',
    )
  })
})

describe("dynamic httpMessage", () => {
  it("NotFoundError computes message from entity field", () => {
    const err = new NotFoundError({ entity: "Project", id: "abc123" })
    expect(err._tag).toBe("NotFoundError")
    expect(err.httpStatus).toBe(404)
    expect(err.httpMessage).toBe("Project not found")
    expect(err.entity).toBe("Project")
    expect(err.id).toBe("abc123")
  })

  it("ValidationError forwards message field", () => {
    const err = new ValidationError({ field: "email", message: "Invalid email format" })
    expect(err.httpStatus).toBe(400)
    expect(err.httpMessage).toBe("Invalid email format")
  })

  it("ConflictError builds message from entity/field/value", () => {
    const err = new ConflictError({ entity: "User", field: "email", value: "foo@bar.com" })
    expect(err.httpStatus).toBe(409)
    expect(err.httpMessage).toBe("User with email 'foo@bar.com' already exists")
  })

  it("UnauthorizedError forwards message field", () => {
    const err = new UnauthorizedError({ message: "Token expired" })
    expect(err.httpStatus).toBe(401)
    expect(err.httpMessage).toBe("Token expired")
  })

  it("BadRequestError forwards message field", () => {
    const err = new BadRequestError({ message: "Missing required field" })
    expect(err.httpStatus).toBe(400)
    expect(err.httpMessage).toBe("Missing required field")
  })

  it("PermissionError forwards message field", () => {
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
