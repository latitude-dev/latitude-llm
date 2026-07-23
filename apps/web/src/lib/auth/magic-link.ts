const magicLinkVerificationPath = "/api/auth/magic-link/verify"
const magicLinkConfirmationPath = "/auth/verify"

export function createMagicLinkConfirmationUrl({
  verificationUrl,
  webUrl,
}: {
  readonly verificationUrl: string
  readonly webUrl: string
}): string {
  const verificationSearchParams = new URL(verificationUrl).searchParams
  const confirmationUrl = new URL(magicLinkConfirmationPath, webUrl)
  confirmationUrl.hash = verificationSearchParams.toString()

  return confirmationUrl.toString()
}

export function reconstructMagicLinkVerificationUrl({
  fragment,
  origin,
}: {
  readonly fragment: string
  readonly origin: string
}): string | null {
  const verificationSearchParams = getMagicLinkVerificationSearchParams(fragment)

  if (!verificationSearchParams) {
    return null
  }

  const verificationUrl = new URL(magicLinkVerificationPath, origin)
  verificationUrl.search = verificationSearchParams.toString()

  return verificationUrl.toString()
}

export function hasMagicLinkVerificationToken(fragment: string): boolean {
  return getMagicLinkVerificationSearchParams(fragment) !== null
}

function getMagicLinkVerificationSearchParams(fragment: string): URLSearchParams | null {
  try {
    decodeURIComponent(fragment.replace(/^#/, "").replace(/\+/g, " "))
  } catch {
    return null
  }

  const verificationSearchParams = new URLSearchParams(fragment.replace(/^#/, ""))

  return verificationSearchParams.get("token") ? verificationSearchParams : null
}
