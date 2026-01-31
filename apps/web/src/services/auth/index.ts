import { database } from '@latitude-data/core/client'
import { sessions } from '@latitude-data/core/schema/models/sessions'
import { users } from '@latitude-data/core/schema/models/users'
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle'
import { AUTH_COOKIE_NAME } from '$/services/auth/constants'
import { Lucia } from 'lucia'
import { env } from '@latitude-data/env'
import { Google } from 'arctic'

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
