import { describe, expect, it } from "vitest"
import {
  createMagicLinkConfirmationUrl,
  hasMagicLinkVerificationToken,
  reconstructMagicLinkVerificationUrl,
} from "./magic-link.ts"

describe("magic link confirmation URLs", () => {
  const verificationUrl =
    "https://console.latitude.so/api/auth/magic-link/verify?token=secret&callbackURL=%2Fprojects&newUserCallbackURL=%2Fwelcome&errorCallbackURL=%2Flogin&ignored=value"

  it("moves all verification parameters into a confirmation URL fragment", () => {
    const confirmationUrl = new URL(
      createMagicLinkConfirmationUrl({ verificationUrl, webUrl: "https://console.latitude.so" }),
    )

    expect(confirmationUrl.pathname).toBe("/auth/verify")
    expect(confirmationUrl.search).toBe("")
    expect(confirmationUrl.hash).toBe(
      "#token=secret&callbackURL=%2Fprojects&newUserCallbackURL=%2Fwelcome&errorCallbackURL=%2Flogin&ignored=value",
    )
  })

  it("reconstructs all verification parameters after confirmation", () => {
    const reconstructedUrl = new URL(
      reconstructMagicLinkVerificationUrl({
        fragment:
          "#token=secret&callbackURL=%2Fprojects&newUserCallbackURL=%2Fwelcome&errorCallbackURL=%2Flogin&ignored=value",
        origin: "https://console.latitude.so",
      }) ?? "",
    )

    expect(reconstructedUrl.pathname).toBe("/api/auth/magic-link/verify")
    expect(reconstructedUrl.searchParams).toEqual(
      new URLSearchParams({
        token: "secret",
        callbackURL: "/projects",
        newUserCallbackURL: "/welcome",
        errorCallbackURL: "/login",
        ignored: "value",
      }),
    )
  })

  it("preserves search parameters nested inside every callback URL", () => {
    const callbackURL = "/projects/project-1?tab=sessions&filter=errors"
    const newUserCallbackURL = "/welcome?utm_source=newsletter&utm_campaign=launch&signup=email"
    const errorCallbackURL = "/login?redirect=%2Fprojects%2Fproject-1%3Ftab%3Dsessions&reason=expired"
    const generatedVerificationUrl = new URL("https://console.latitude.so/api/auth/magic-link/verify")
    generatedVerificationUrl.searchParams.set("token", "secret")
    generatedVerificationUrl.searchParams.set("callbackURL", callbackURL)
    generatedVerificationUrl.searchParams.set("newUserCallbackURL", newUserCallbackURL)
    generatedVerificationUrl.searchParams.set("errorCallbackURL", errorCallbackURL)
    generatedVerificationUrl.searchParams.set("futureParameter", "future-value")

    const confirmationUrl = new URL(
      createMagicLinkConfirmationUrl({
        verificationUrl: generatedVerificationUrl.toString(),
        webUrl: "https://console.latitude.so",
      }),
    )
    const reconstructedUrl = new URL(
      reconstructMagicLinkVerificationUrl({
        fragment: confirmationUrl.hash,
        origin: confirmationUrl.origin,
      }) ?? "",
    )

    expect(reconstructedUrl.searchParams.get("callbackURL")).toBe(callbackURL)
    expect(reconstructedUrl.searchParams.get("newUserCallbackURL")).toBe(newUserCallbackURL)
    expect(reconstructedUrl.searchParams.get("errorCallbackURL")).toBe(errorCallbackURL)
    expect(reconstructedUrl.searchParams.get("futureParameter")).toBe("future-value")
  })

  it("rejects fragments without a token", () => {
    expect(hasMagicLinkVerificationToken("#callbackURL=%2Fprojects")).toBe(false)
    expect(
      reconstructMagicLinkVerificationUrl({
        fragment: "#callbackURL=%2Fprojects",
        origin: "https://console.latitude.so",
      }),
    ).toBeNull()
  })

  it("rejects malformed fragments", () => {
    expect(hasMagicLinkVerificationToken("#token=%")).toBe(false)
  })
})
