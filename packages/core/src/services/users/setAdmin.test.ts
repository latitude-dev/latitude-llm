import { describe, expect, it } from 'vitest'

import { setUserAdmin } from './setAdmin'
import * as factories from '../../tests/factories'

describe('setUserAdmin', () => {
  it('grants admin access to a non-admin user', async () => {
    const user = await factories.createUser()

    const result = await setUserAdmin(user, true)

    expect(result.ok).toBe(true)
    expect(result.unwrap().admin).toBe(true)
  })

  it('revokes admin access when other admins remain', async () => {
    const first = await factories.createUser()
    const second = await factories.createUser()
    await setUserAdmin(first, true).then((r) => r.unwrap())
    const secondAdmin = await setUserAdmin(second, true).then((r) => r.unwrap())

    const result = await setUserAdmin(secondAdmin, false)

    expect(result.ok).toBe(true)
    expect(result.unwrap().admin).toBe(false)
  })

  it('rejects revoking admin access from the last admin', async () => {
    const user = await factories.createUser()
    const admin = await setUserAdmin(user, true).then((r) => r.unwrap())

    const result = await setUserAdmin(admin, false)

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe('Cannot remove the last admin')
  })

  it('is a no-op when the value is unchanged', async () => {
    const user = await factories.createUser()

    const result = await setUserAdmin(user, false)

    expect(result.ok).toBe(true)
    expect(result.unwrap().admin).toBe(false)
  })
})
