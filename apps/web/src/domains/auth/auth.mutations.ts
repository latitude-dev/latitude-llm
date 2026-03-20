import { generateId } from "@domain/shared"
import { createOptimisticAction } from "@tanstack/react-db"
import { completeAuthIntent, createLoginIntent, createSignupIntent, exchangeCliSession } from "./auth.functions.ts"

export const createLoginIntentMutation = createOptimisticAction<{ email: string }>({
  onMutate: () => {},
  mutationFn: async ({ email }) => {
    return createLoginIntent({ data: { email, intentId: generateId() } })
  },
})

export const createSignupIntentMutation = createOptimisticAction<{
  name: string
  email: string
  organizationName: string
}>({
  onMutate: () => {},
  mutationFn: async ({ name, email, organizationName }) => {
    return createSignupIntent({
      data: {
        intentId: generateId(),
        name,
        email,
        organizationName,
      },
    })
  },
})

export const completeAuthIntentMutation = createOptimisticAction<{
  intentId: string
  name?: string
}>({
  onMutate: () => {},
  mutationFn: async ({ intentId, name }) => {
    return completeAuthIntent({ data: { intentId, name } })
  },
})

export const exchangeCliSessionMutation = createOptimisticAction<{ sessionToken: string }>({
  onMutate: () => {},
  mutationFn: async ({ sessionToken }) => {
    return exchangeCliSession({ data: { sessionToken } })
  },
})
