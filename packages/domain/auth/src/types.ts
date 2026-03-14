export type AuthIntentType = "login" | "signup" | "invite"

export interface SignupIntentData {
  readonly name: string
  readonly organizationName: string
}

export interface InviteIntentData {
  readonly organizationId: string
  readonly organizationName: string
  readonly inviterName: string
}

export interface AuthIntentData {
  readonly signup?: SignupIntentData
  readonly invite?: InviteIntentData
}

export interface AuthIntent {
  readonly id: string
  readonly type: AuthIntentType
  readonly email: string
  readonly data: AuthIntentData
  readonly existingAccountAtRequest: boolean
  readonly expiresAt: Date
  readonly consumedAt: Date | null
  readonly createdOrganizationId: string | null
}

export type MagicLinkEmailTemplate = "default" | "signupExistingAccount" | "invite"
