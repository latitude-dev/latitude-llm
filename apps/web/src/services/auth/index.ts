import { database } from '@latitude-data/core/client'
import { sessions, users } from '@latitude-data/core/schema'
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle'
import { AUTH_COOKIE_NAME } from '$/services/auth/constants'
import { Lucia } from 'lucia'
import { env } from '@latitude-data/env'

const adapter = new DrizzlePostgreSQLAdapter(
  // @ts-expect-error - No idea why this is happening
  database,
  sessions,
  users,
)

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
      secure: !!env.SECURE_LUCIA,
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
