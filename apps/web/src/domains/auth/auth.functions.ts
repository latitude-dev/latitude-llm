import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { getBetterAuth } from "../../server/clients.ts"

type SignInInput = {
  readonly email: string
  readonly password: string
}

type SignUpInput = {
  readonly name: string
  readonly email: string
  readonly password: string
}

interface BetterAuthApi {
  signInEmail: (options: {
    readonly body: SignInInput
    readonly headers?: Headers
  }) => Promise<{ readonly user?: { readonly id: string } }>
  signUpEmail: (options: {
    readonly body: SignUpInput
    readonly headers?: Headers
  }) => Promise<{ readonly user?: { readonly id: string } }>
  signOut: (options: {
    readonly headers?: Headers
  }) => Promise<unknown>
}

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((data: SignInInput) => data)
  .handler(async ({ data }) => {
    const authApi = getBetterAuth().api as unknown as BetterAuthApi
    const headers = getRequestHeaders()

    const result = await authApi.signInEmail({
      body: {
        email: data.email,
        password: data.password,
      },
      headers,
    })

    if (!result.user) {
      throw new Error("Invalid credentials")
    }
  })

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((data: SignUpInput) => data)
  .handler(async ({ data }) => {
    const authApi = getBetterAuth().api as unknown as BetterAuthApi
    const headers = getRequestHeaders()

    const result = await authApi.signUpEmail({
      body: {
        name: data.name,
        email: data.email,
        password: data.password,
      },
      headers,
    })

    if (!result.user) {
      throw new Error("Failed to create account")
    }
  })

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const authApi = getBetterAuth().api as unknown as BetterAuthApi
  const headers = getRequestHeaders()

  await authApi.signOut({ headers })
})
