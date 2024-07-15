import { SafeUser } from '$core/schema'

export class UserNotFoundError extends Error {
  constructor() {
    super('User not found')
  }
}

export type SessionData = {
  user: SafeUser
  workspace: { id: number; name: string }
}
