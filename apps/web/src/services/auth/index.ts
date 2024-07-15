import { database, sessions, users } from '@latitude-data/core'
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle'
import { Lucia } from 'lucia'

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
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === 'production',
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
