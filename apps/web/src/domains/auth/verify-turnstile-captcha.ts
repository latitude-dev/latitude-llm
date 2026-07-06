import { BadRequestError } from "@domain/shared"

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

interface TurnstileSiteverifyResponse {
  success: boolean
}

export async function verifyTurnstileToken(
  captchaToken: string,
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: captchaToken }),
    })

    if (!response.ok) return false

    const body = (await response.json()) as TurnstileSiteverifyResponse
    return body.success === true
  } catch {
    return false
  }
}

export async function assertTurnstileCaptchaVerified(params: {
  captchaToken?: string | undefined
  secretKey?: string | undefined
  verify?: (captchaToken: string, secretKey: string) => Promise<boolean>
}): Promise<void> {
  const { captchaToken, secretKey, verify = verifyTurnstileToken } = params

  if (!secretKey) return

  if (!captchaToken) {
    throw new BadRequestError({ message: "Captcha verification is required" })
  }

  const valid = await verify(captchaToken, secretKey)
  if (!valid) {
    throw new BadRequestError({ message: "Captcha verification failed" })
  }
}
