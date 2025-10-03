import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupAction } from './setupAction'

const mocks = vi.hoisted(() => {
  return {
    createMagicLinkToken: vi.fn(),
  }
})

vi.mock('@latitude-data/core/services/magicLinkTokens/create', () => ({
  createMagicLinkToken: mocks.createMagicLinkToken,
}))

describe('setupAction', () => {
  beforeEach(() => {
    mocks.createMagicLinkToken.mockResolvedValue({ unwrap: () => ({}) })
  })

  // TODO: unskip once we have email signup again
  it.skip('accepts a valid email', async () => {
    const { data, serverError, validationErrors } = await setupAction({
      name: 'John Doe',
      email: 'john@example.com',
      companyName: 'Acme Inc',
    })

    expect(validationErrors).toBeUndefined()
    expect(serverError).toBeUndefined()
    expect(mocks.createMagicLinkToken).toHaveBeenCalled()
    expect(data.frontendRedirect).toBeDefined()
  })

  it('rejects an email that is already in use', async () => {
    await factories.createUser({ email: 'existing@example.com' })

    const { data, validationErrors } = await setupAction({
      name: 'John Doe',
      email: 'existing@example.com',
      companyName: 'Acme Inc',
    })

    expect(data).toBeUndefined()
    expect(validationErrors).toBeDefined()
    expect(validationErrors?.fieldErrors.email).toContain(
      'Email is already in use',
    )
  })

  it('rejects an email with a plus sign and number', async () => {
    const { data, validationErrors } = await setupAction({
      name: 'John Doe',
      email: 'john+123@example.com',
      companyName: 'Acme Inc',
    })

    expect(data).toBeUndefined()
    expect(validationErrors?.fieldErrors.email).toContain('Email is not valid')
  })

  // TODO: unskip once we have email signup again
  it.skip('accepts an email with a subdomain', async () => {
    const { data, validationErrors, serverError } = await setupAction({
      name: 'John Doe',
      email: 'john@subdomain.example.com',
      companyName: 'Acme Inc',
    })

    expect(validationErrors).toBeUndefined()
    expect(serverError).toBeUndefined()
    expect(mocks.createMagicLinkToken).toHaveBeenCalled()
    expect(data.frontendRedirect).toBeDefined()
  })

  it('rejects an email with invalid characters', async () => {
    const { data, validationErrors } = await setupAction({
      name: 'John Doe',
      email: 'john@exa!mple.com',
      companyName: 'Acme Inc',
    })

    expect(data).toBeUndefined()
    expect(validationErrors?.fieldErrors.email).toContain(
      'Invalid email address',
    )
  })

  it('rejects an email without a domain', async () => {
    const { data, validationErrors } = await setupAction({
      name: 'John Doe',
      email: 'johndoe',
      companyName: 'Acme Inc',
    })

    expect(data).toBeUndefined()
    expect(validationErrors?.fieldErrors.email).toContain(
      'Invalid email address',
    )
  })

  it('rejects an empty name', async () => {
    const { data, validationErrors } = await setupAction({
      name: '',
      email: 'john@example.com',
      companyName: 'Acme Inc',
    })

    expect(data).toBeUndefined()
    expect(validationErrors?.fieldErrors.name).toContain(
      'Name is a required field',
    )
  })

  it('rejects an empty company name', async () => {
    const { data, validationErrors } = await setupAction({
      name: 'John Doe',
      email: 'john@example.com',
      companyName: '',
    })

    expect(data).toBeUndefined()
    expect(validationErrors?.fieldErrors.companyName).toContain(
      'Workspace name is a required field',
    )
  })
})
