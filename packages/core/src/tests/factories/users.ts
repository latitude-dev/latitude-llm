import { faker } from '@faker-js/faker'

import { createUser as createUserFn } from '../../services/users/createUser'
import { type User } from '../../schema/models/types/User'

function makeRandomUserData() {
  return {
    name: faker.person.firstName(),
    email: faker.internet.email(),
  }
}
export async function createUser(userData: Partial<User> = {}) {
  const randomUserData = makeRandomUserData()
  const data = { ...randomUserData, ...userData }
  const result = await createUserFn(data)
  return result.unwrap()
}
