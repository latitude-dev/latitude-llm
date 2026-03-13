import type { AuthIntent, MagicLinkEmailTemplate } from "../types.ts"

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const createSignupIntentData = ({ name, organizationName }: { name: string; organizationName: string }) => {
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

export const createInviteIntentData = ({
  organizationId,
  organizationName,
  inviterName,
}: {
  organizationId: string
  organizationName: string
  inviterName: string
}) => {
  if (!organizationId) {
    throw new Error("Organization ID is required")
  }

  return {
    invite: {
      organizationId,
      organizationName: organizationName.trim() || "a workspace",
      inviterName: inviterName.trim() || "Someone",
    },
  } as const
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
  if (type === "invite") {
    return "invite"
  }

  if (type === "signup" && existingAccountAtRequest) {
    return "signupExistingAccount"
  }

  return "default"
}
