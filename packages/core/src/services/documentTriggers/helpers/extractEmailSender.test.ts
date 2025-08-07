import { describe, expect, it } from 'vitest'
import { extractEmailSender } from './extractEmailSender'

describe('extractEmailSender', () => {
  it('extracts both name and email', () => {
    const from = 'Bob <bob@email.com>'
    const sender = 'bob@email.com'
    const result = extractEmailSender({ from, sender })
    expect(result).toEqual({ name: 'Bob', email: 'bob@email.com' })
  })

  it('returns only the email when "from" is not in the expected format', () => {
    const from = 'Bob bob@email.com'
    const sender = 'bob@email.com'
    const result = extractEmailSender({ from, sender })
    expect(result).toEqual({ name: undefined, email: 'bob@email.com' })
  })
})
