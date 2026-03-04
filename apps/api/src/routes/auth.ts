import { BadRequestError } from "@domain/shared"
import type { User } from "better-auth"
import { Hono } from "hono"
import { getBetterAuth } from "../clients.ts"
import { createSignUpIpRateLimiter } from "../middleware/rate-limiter.ts"

interface BetterAuthAPI {
  signUpEmail: (options: {
    body: { email: string; password: string; name: string }
    headers?: Headers
  }) => Promise<{ token: string; user: User } | { token: null; user: User }>
  signInEmail: (options: {
    body: { email: string; password: string }
    headers?: Headers
  }) => Promise<{ token: string; user: User } | { token: null; user: User }>
}

export const createAuthRoutes = () => {
  const app = new Hono()
  const signUpRateLimiter = createSignUpIpRateLimiter()
  const auth = getBetterAuth()
  const authApi = auth.api as unknown as BetterAuthAPI

  app.post("/sign-up/email", signUpRateLimiter, async (c) => {
    const body = (await c.req.json()) as {
      readonly email: string
      readonly password: string
      readonly name: string
    }

    if (!body.email || typeof body.email !== "string") {
      throw new BadRequestError({
        httpMessage: "Email is required",
        field: "email",
      })
    }
    if (!body.password || typeof body.password !== "string") {
      throw new BadRequestError({
        httpMessage: "Password is required",
        field: "password",
      })
    }
    if (!body.name || typeof body.name !== "string") {
      throw new BadRequestError({
        httpMessage: "Name is required",
        field: "name",
      })
    }

    if (body.password.length < 8) {
      throw new BadRequestError({
        httpMessage: "Password must be at least 8 characters",
        field: "password",
      })
    }
    if (body.password.length > 128) {
      throw new BadRequestError({
        httpMessage: "Password must not exceed 128 characters",
        field: "password",
      })
    }

    const result = await authApi.signUpEmail({
      body: {
        email: body.email,
        password: body.password,
        name: body.name,
      },
      headers: c.req.raw.headers,
    })

    if (!result.token) {
      throw new Error("Failed to create account")
    }

    return c.json(
      {
        token: result.token,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          emailVerified: result.user.emailVerified,
        },
      },
      201,
    )
  })

  app.post("/sign-in/email", signUpRateLimiter, async (c) => {
    const body = (await c.req.json()) as {
      readonly email: string
      readonly password: string
    }

    if (!body.email || typeof body.email !== "string") {
      throw new BadRequestError({
        httpMessage: "Email is required",
        field: "email",
      })
    }
    if (!body.password || typeof body.password !== "string") {
      throw new BadRequestError({
        httpMessage: "Password is required",
        field: "password",
      })
    }

    const result = await authApi.signInEmail({
      body: {
        email: body.email,
        password: body.password,
      },
      headers: c.req.raw.headers,
    })

    if (!result.token) {
      throw new BadRequestError({ httpMessage: "Invalid credentials" })
    }

    return c.json({
      token: result.token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        emailVerified: result.user.emailVerified,
      },
    })
  })

  return app
}
