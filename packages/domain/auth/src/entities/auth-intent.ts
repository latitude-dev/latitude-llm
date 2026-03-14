import { generateId } from "@domain/shared"
import type { AuthIntent, AuthIntentData, AuthIntentType } from "../types.ts"

interface CreateAuthIntentParams {
  id?: string | undefined
  type: AuthIntentType
  email: string
  data: AuthIntentData
  existingAccountAtRequest: boolean
  expiresAt: Date
  consumedAt?: Date | null
  createdOrganizationId?: string | null
}

export const createAuthIntent = (params: CreateAuthIntentParams): AuthIntent => {
  return {
    id: params.id ?? generateId(),
    type: params.type,
    email: params.email,
    data: params.data,
    existingAccountAtRequest: params.existingAccountAtRequest,
    expiresAt: params.expiresAt,
    consumedAt: params.consumedAt ?? null,
    createdOrganizationId: params.createdOrganizationId ?? null,
  }
}
