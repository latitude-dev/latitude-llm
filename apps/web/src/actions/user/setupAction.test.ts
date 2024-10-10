import * as factories from '@latitude-data/core/factories'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupAction } from './setupAction'

const mocks = vi.hoisted(() => {
  return {
    createMagicLinkToken: vi.fn(),
    redirect: vi.fn(),
  }
})

vi.mock('@latitude-data/core/services/magicLinkTokens/create', () => ({
  createMagicLinkToken: mocks.createMagicLinkToken,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

describe('setupAction', () => {
  beforeEach(() => {
    mocks.createMagicLinkToken.mockResolvedValue({ unwrap: () => ({}) })
    mocks.redirect.mockImplementation(() => {})
  })

  it('accepts a valid email', async () => {
    const [_, error] = await setupAction({
      // @ts-expect-error - testing
      name: 'John Doe',
      email: 'john@example.com',
      companyName: 'Acme Inc',
    })

    expect(error).toBeNull()
    expect(mocks.createMagicLinkToken).toHaveBeenCalled()
    expect(mocks.redirect).toHaveBeenCalled()
  })

  it('rejects an email that is already in use', async () => {
    await factories.createUser({ email: 'existing@example.com' })

    const [data, error] = await setupAction({
      // @ts-expect-error - testing
      name: 'John Doe',
      email: 'existing@example.com',
      companyName: 'Acme Inc',
    })

    expect(error).toBeDefined()
    expect(error!.message).toContain('Email is already in use')
    expect(data).toBeNull()
  })

  it('rejects an email with a plus sign and number', async () => {
    const [data, error] = await setupAction({
      // @ts-expect-error - testing
      name: 'John Doe',
      email: 'john+123@example.com',
      companyName: 'Acme Inc',
    })

    expect(error).not.toBeNull()
    expect(error!.message).toContain('Email is not valid')
    expect(data).toBeNull()
  })

  it('accepts an email with a subdomain', async () => {
    const [_, error] = await setupAction({
      // @ts-expect-error - testing
      name: 'John Doe',
      email: 'john@subdomain.example.com',
      companyName: 'Acme Inc',
    })

    expect(error).toBeNull()
    expect(mocks.createMagicLinkToken).toHaveBeenCalled()
    expect(mocks.redirect).toHaveBeenCalled()
  })

  it('rejects an email with invalid characters', async () => {
    const [data, error] = await setupAction({
      // @ts-expect-error - testing
      name: 'John Doe',
      email: 'john@exa!mple.com',
      companyName: 'Acme Inc',
    })

    expect(error).toBeDefined()
    expect(data).toBeNull()
  })

  it('rejects an email without a domain', async () => {
    const [data, error] = await setupAction({
      // @ts-expect-error - testing
      name: 'John Doe',
      email: 'johndoe',
      companyName: 'Acme Inc',
    })

    expect(error).toBeDefined()
    expect(error!.message).toContain('Invalid email')
    expect(data).toBeNull()
  })

  it('rejects an empty name', async () => {
    const [data, error] = await setupAction({
      // @ts-expect-error - testing
      name: '',
      email: 'john@example.com',
      companyName: 'Acme Inc',
    })

    expect(error).toBeDefined()
    expect(error!.message).toContain('Name is a required field')
    expect(data).toBeNull()
  })

  it('rejects an empty company name', async () => {
    const [data, error] = await setupAction({
      // @ts-expect-error - testing
      name: 'John Doe',
      email: 'john@example.com',
      companyName: '',
    })

    expect(error).toBeDefined()
    expect(error!.message).toContain('Workspace name is a required field')
    expect(data).toBeNull()
  })
})
