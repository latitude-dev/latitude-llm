import { describe, it, expect } from 'vitest'
import { findOrCreateUserFromOAuth } from './findOrCreateUserFromOAuth'
import { OAuthProvider } from '../../schema/models/oauthAccounts'
import { createProject, createOAuthAccount } from '../../tests/factories'

describe('Auth Service: findOrCreateUserFromOAuth', () => {
  const testProviderId: OAuthProvider = OAuthProvider.GOOGLE
  const testProviderUserId = 'google-user-123'
  const testEmail = 'test@example.com'
  const testName = 'Test User'

  it('should return existing user and workspace if OAuth account exists', async () => {
    const { workspace: existingWorkspace, user: existingUser } =
      await createProject()

    await createOAuthAccount({
      providerId: testProviderId,
      providerUserId: testProviderUserId,
      userId: existingUser.id,
    })

    const result = await findOrCreateUserFromOAuth({
      providerId: testProviderId,
      providerUserId: testProviderUserId,
      email: testEmail, // Email might be different if updated at provider
      name: testName,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected success')

    expect(result.value!.isNewUser).toBe(false)
    expect(result.value!.user.id).toBe(existingUser.id)
    expect(result.value!.workspace.id).toBe(existingWorkspace.id)
  })

  it('should create a new user, workspace, membership, and link OAuth account if user does not exist', async () => {
    const result = await findOrCreateUserFromOAuth({
      providerId: testProviderId,
      providerUserId: testProviderUserId,
      email: testEmail,
      name: testName,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Expected success')

    expect(result.value!.isNewUser).toBe(true)
    const newUser = result.value!.user
    const newWorkspace = result.value!.workspace

    // Verify user details
    expect(newUser.email).toBe(testEmail)
    expect(newUser.name).toBe(testName)

    // Verify workspace details (created by setupService)
    expect(newWorkspace.name).toBe(`${testName}'s Workspace`)
  })
})
