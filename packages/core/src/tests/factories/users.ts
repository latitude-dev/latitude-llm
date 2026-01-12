import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { users } from '../../schema/models/users'
import { createUser as createUserFn } from '../../services/users/createUser'

function makeRandomUserData() {
  return {
    name: faker.person.firstName(),
    email: faker.internet.email(),
  }
}

export type ICreateUser = {
  name?: string
  email?: string
  createdAt?: Date
}

export async function createUser(userData: Partial<ICreateUser> = {}) {
  const { createdAt, ...rest } = userData
  const randomUserData = makeRandomUserData()
  const data = { ...randomUserData, ...rest }
  const user = await createUserFn(data).then((r) => r.unwrap())

  if (createdAt) {
    await database.update(users).set({ createdAt }).where(eq(users.id, user.id))
    user.createdAt = createdAt
  }

  return user
}
