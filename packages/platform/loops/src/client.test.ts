import { MARKETING_FIELD_MAX_LENGTH, MarketingContactsError } from "@domain/marketing"
import { Cause, Effect, Exit } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { createContactMock, updateContactMock } = vi.hoisted(() => ({
  createContactMock: vi.fn(),
  updateContactMock: vi.fn(),
}))

vi.mock("loops", async (importActual) => {
  const actual = await importActual<typeof import("loops")>()
  return {
    ...actual,
    LoopsClient: class MockLoopsClient {
      createContact = createContactMock
      updateContact = updateContactMock
    },
  }
})

const { APIError } = await import("loops")
const { createLoopsContactsSender } = await import("./client.ts")

const successResponse = { success: true as const, id: "contact-id" }

const expectFailure = async (effect: Effect.Effect<void, MarketingContactsError>): Promise<MarketingContactsError> => {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) {
    throw new Error("Expected failure but Effect succeeded")
  }
  const failReason = exit.cause.reasons.find(Cause.isFailReason)
  if (!failReason) {
    throw new Error("Expected a typed failure reason in the cause")
  }
  return failReason.error
}

describe("createLoopsContactsSender", () => {
  beforeEach(() => {
    createContactMock.mockReset()
    updateContactMock.mockReset()
  })

  it("returns a no-op sender when config is undefined", async () => {
    const noop = createLoopsContactsSender(undefined)
    await Effect.runPromise(noop.createContact({ email: "a@b.co", userId: "user_123" }))
    await Effect.runPromise(noop.updateContact({ userId: "user_123" }))
    expect(createContactMock).not.toHaveBeenCalled()
    expect(updateContactMock).not.toHaveBeenCalled()
  })

  it("forwards create properties and ISO-formats createdAt", async () => {
    const sender = createLoopsContactsSender({ apiKey: "test-key" })
    createContactMock.mockResolvedValueOnce(successResponse)

    const createdAt = new Date("2026-05-05T12:00:00.000Z")
    await Effect.runPromise(
      sender.createContact({
        email: "a@b.co",
        userId: "user_123",
        firstName: " Ada ",
        source: "LatitudeV2Signup",
        createdAt,
        subscribed: true,
      }),
    )

    expect(createContactMock).toHaveBeenCalledWith({
      email: "a@b.co",
      properties: {
        userId: "user_123",
        firstName: "Ada",
        source: "LatitudeV2Signup",
        subscribed: true,
        createdAt: createdAt.toISOString(),
      },
    })
  })

  it("swallows duplicate-contact APIErrors on create", async () => {
    const sender = createLoopsContactsSender({ apiKey: "test-key" })
    createContactMock.mockRejectedValueOnce(
      new APIError(409, { success: false, message: "Email or userId is already on list." }),
    )

    await Effect.runPromise(sender.createContact({ email: "a@b.co", userId: "user_123" }))
  })

  it("surfaces non-duplicate create failures as MarketingContactsError", async () => {
    const sender = createLoopsContactsSender({ apiKey: "test-key" })
    createContactMock.mockRejectedValueOnce(new APIError(429, { success: false, message: "rate limited" }))

    const error = await expectFailure(sender.createContact({ email: "a@b.co", userId: "user_123" }))
    expect(error).toBeInstanceOf(MarketingContactsError)
    expect(error.operation).toBe("createContact")
    expect(error.userId).toBe("user_123")
  })

  it("looks up by userId and forwards email + sanitized properties on update", async () => {
    const sender = createLoopsContactsSender({ apiKey: "test-key" })
    updateContactMock.mockResolvedValueOnce(successResponse)

    const longTitle = "x".repeat(MARKETING_FIELD_MAX_LENGTH + 50)
    await Effect.runPromise(
      sender.updateContact({
        userId: "user_123",
        email: "new@b.co",
        jobTitle: longTitle,
        telemetryEnabled: true,
      }),
    )

    expect(updateContactMock).toHaveBeenCalledWith({
      userId: "user_123",
      properties: {
        email: "new@b.co",
        jobTitle: "x".repeat(MARKETING_FIELD_MAX_LENGTH),
        telemetryEnabled: true,
      },
    })
  })

  it("propagates update failures as MarketingContactsError", async () => {
    const sender = createLoopsContactsSender({ apiKey: "test-key" })
    updateContactMock.mockRejectedValueOnce(new APIError(404, { success: false, message: "contact not found" }))

    const error = await expectFailure(sender.updateContact({ userId: "user_123" }))
    expect(error).toBeInstanceOf(MarketingContactsError)
    expect(error.operation).toBe("updateContact")
    expect(error.userId).toBe("user_123")
  })

  it("fails create with MarketingContactsError when input violates schema", async () => {
    const sender = createLoopsContactsSender({ apiKey: "test-key" })

    const error = await expectFailure(sender.createContact({ email: "not-an-email", userId: "user_123" } as never))
    expect(error).toBeInstanceOf(MarketingContactsError)
    expect(error.operation).toBe("createContact")
    expect(error.userId).toBe("user_123")
    expect(error.cause).toMatchObject({ path: ["email"] })
    expect(createContactMock).not.toHaveBeenCalled()
  })

  it("fails create with userId='unknown' when userId is missing from input", async () => {
    const sender = createLoopsContactsSender({ apiKey: "test-key" })

    const error = await expectFailure(sender.createContact({ email: "a@b.co" } as never))
    expect(error).toBeInstanceOf(MarketingContactsError)
    expect(error.userId).toBe("unknown")
    expect(error.cause).toMatchObject({ path: ["userId"] })
    expect(createContactMock).not.toHaveBeenCalled()
  })

  it("fails update with MarketingContactsError when userId is missing", async () => {
    const sender = createLoopsContactsSender({ apiKey: "test-key" })

    const error = await expectFailure(sender.updateContact({ telemetryEnabled: true } as never))
    expect(error).toBeInstanceOf(MarketingContactsError)
    expect(error.operation).toBe("updateContact")
    expect(error.userId).toBe("unknown")
    expect(error.cause).toMatchObject({ path: ["userId"] })
    expect(updateContactMock).not.toHaveBeenCalled()
  })
})
