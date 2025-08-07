import { AUTH_COOKIE_NAME } from '$/services/auth/constants'
import { database } from '@latitude-data/core/client'
import { sessions, users } from '@latitude-data/core/schema'
import { env } from '@latitude-data/env'
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle'
import { Google } from 'arctic'
import { Lucia } from 'lucia'

// @ts-ignore
const adapter = new DrizzlePostgreSQLAdapter(database, sessions, users)

interface DatabaseUserAttributes {
  email: string
}

interface DatabaseSessionAttributes {
  currentWorkspaceId: number
}

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia
    DatabaseUserAttributes: DatabaseUserAttributes
    DatabaseSessionAttributes: DatabaseSessionAttributes
  }
}

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: AUTH_COOKIE_NAME,
    expires: false,
    attributes: {
      secure: !!env.SECURE_COOKIES,
    },
  },
  getUserAttributes: (attributes) => {
    return {
      email: attributes.email,
    }
  },
  getSessionAttributes: (attributes) => {
    return {
      currentWorkspaceId: attributes.currentWorkspaceId,
    }
  },
})

export const googleProvider = new Google(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI,
)
