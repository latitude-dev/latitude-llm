import type { AuthIntent, MagicLinkEmailTemplate } from "../types.ts"

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const createSignupIntentData = ({
  name,
  organizationName,
}: {
  name: string
  organizationName: string
}) => {
  const normalizedName = name.trim()
  const normalizedOrganizationName = organizationName.trim()

  if (!normalizedName) {
    throw new Error("Name is required")
  }

  if (!normalizedOrganizationName) {
    throw new Error("Workspace name is required")
  }

  return {
    signup: {
      name: normalizedName,
      organizationName: normalizedOrganizationName,
    },
  } as const
}

export const assertIntentCanBeCompleted = ({
  intent,
  sessionEmail,
  now,
}: {
  intent: AuthIntent
  sessionEmail: string
  now: Date
}) => {
  if (intent.expiresAt.getTime() < now.getTime()) {
    throw new Error("Authentication intent has expired")
  }

  if (normalizeEmail(intent.email) !== normalizeEmail(sessionEmail)) {
    throw new Error("Authentication intent email mismatch")
  }
}

export const shouldCreateOrganizationForIntent = (intent: AuthIntent) => {
  return intent.type === "signup" && !intent.existingAccountAtRequest
}

export const resolveMagicLinkEmailTemplateFromContext = ({
  type,
  existingAccountAtRequest,
}: {
  type: AuthIntent["type"]
  existingAccountAtRequest: boolean
}): MagicLinkEmailTemplate => {
  if (type === "signup" && existingAccountAtRequest) {
    return "signupExistingAccount"
  }

  return "default"
}
