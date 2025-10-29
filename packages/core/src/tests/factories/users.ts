import { faker } from '@faker-js/faker'

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
  const randomUserData = makeRandomUserData()
  const data = { ...randomUserData, ...userData }
  const result = await createUserFn(data)
  return result.unwrap()
}
