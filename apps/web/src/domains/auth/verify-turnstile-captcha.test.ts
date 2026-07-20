import { describe, expect, it, vi } from "vitest"
import { assertTurnstileCaptchaVerified, verifyTurnstileToken } from "./verify-turnstile-captcha.ts"

describe("assertTurnstileCaptchaVerified", () => {
  it("skips verification when no Turnstile secret is configured", async () => {
    await expect(assertTurnstileCaptchaVerified({ secretKey: undefined })).resolves.toBeUndefined()
    await expect(
      assertTurnstileCaptchaVerified({ captchaToken: undefined, secretKey: undefined }),
    ).resolves.toBeUndefined()
  })

  it("requires a captcha token when Turnstile is configured", async () => {
    await expect(assertTurnstileCaptchaVerified({ secretKey: "secret" })).rejects.toThrow(
      expect.objectContaining({
        _tag: "BadRequestError",
        message: "Captcha verification is required",
      }),
    )
  })

  it("rejects an invalid captcha token", async () => {
    await expect(
      assertTurnstileCaptchaVerified({
        captchaToken: "bad-token",
        secretKey: "secret",
        verify: async () => false,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        _tag: "BadRequestError",
        message: "Captcha verification failed",
      }),
    )
  })

  it("passes when captcha verification succeeds", async () => {
    await expect(
      assertTurnstileCaptchaVerified({
        captchaToken: "good-token",
        secretKey: "secret",
        verify: async () => true,
      }),
    ).resolves.toBeUndefined()
  })
})

describe("verifyTurnstileToken", () => {
  it("returns true when Cloudflare siteverify succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    await expect(verifyTurnstileToken("token", "secret", fetchImpl)).resolves.toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: expect.any(URLSearchParams),
      signal: expect.any(AbortSignal),
    })
    const firstCall = fetchImpl.mock.calls.at(0)
    if (!firstCall) throw new Error("Expected fetch to be called")
    const [, init] = firstCall
    const body = init?.body as URLSearchParams
    expect(body.get("secret")).toBe("secret")
    expect(body.get("response")).toBe("token")
  })

  it("returns false when siteverify responds with success: false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    })

    await expect(verifyTurnstileToken("token", "secret", fetchImpl)).resolves.toBe(false)
  })

  it("returns false when siteverify HTTP response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false })

    await expect(verifyTurnstileToken("token", "secret", fetchImpl)).resolves.toBe(false)
  })

  it("returns false when siteverify cannot be reached", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"))

    await expect(verifyTurnstileToken("token", "secret", fetchImpl)).resolves.toBe(false)
  })

  it("returns false when siteverify times out", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "TimeoutError"))

    await expect(verifyTurnstileToken("token", "secret", fetchImpl)).resolves.toBe(false)
  })
})
