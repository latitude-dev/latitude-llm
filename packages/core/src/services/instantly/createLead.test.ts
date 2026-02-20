import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LatitudeGoal } from '@latitude-data/constants/users'
import {
  createInstantlyLead,
  getCampaignIdForGoal,
  parseName,
} from './createLead'

const mockFetch = vi.fn()

vi.mock('../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

const FALLBACK_CAMPAIGN_ID = '61c8f29c-2846-4730-a9b8-4f2770b0b93f'

describe('getCampaignIdForGoal', () => {
  it('returns mapped campaign ID for JustExploring', () => {
    expect(getCampaignIdForGoal(LatitudeGoal.JustExploring)).toBe(
      FALLBACK_CAMPAIGN_ID,
    )
  })

  it('returns mapped campaign ID for ManagingPromptVersions', () => {
    expect(getCampaignIdForGoal(LatitudeGoal.ManagingPromptVersions)).toBe(
      '082db951-8d9f-410f-acc1-2e5d22794c8c',
    )
  })

  it('returns mapped campaign ID for ObservingTraces', () => {
    expect(getCampaignIdForGoal(LatitudeGoal.ObservingTraces)).toBe(
      '03881291-726f-4aaf-9f88-871392f9dfaa',
    )
  })

  it('returns mapped campaign ID for ImprovingAccuracy', () => {
    expect(getCampaignIdForGoal(LatitudeGoal.ImprovingAccuracy)).toBe(
      'df56b6eb-a71b-4be9-99d9-75d5b0cb5ce3',
    )
  })

  it('returns mapped campaign ID for SettingUpEvaluations', () => {
    expect(getCampaignIdForGoal(LatitudeGoal.SettingUpEvaluations)).toBe(
      'ef299a4f-99df-4bea-b5a4-581e09010adc',
    )
  })

  it('returns fallback campaign ID for null', () => {
    expect(getCampaignIdForGoal(null)).toBe(FALLBACK_CAMPAIGN_ID)
  })

  it('returns fallback campaign ID for undefined', () => {
    expect(getCampaignIdForGoal(undefined)).toBe(FALLBACK_CAMPAIGN_ID)
  })

  it('returns fallback campaign ID for Other', () => {
    expect(getCampaignIdForGoal(LatitudeGoal.Other)).toBe(FALLBACK_CAMPAIGN_ID)
  })
})

describe('parseName', () => {
  it('returns empty object for null or undefined', () => {
    expect(parseName(null)).toEqual({})
    expect(parseName(undefined)).toEqual({})
  })

  it('returns empty object for empty or whitespace string', () => {
    expect(parseName('')).toEqual({})
    expect(parseName('   ')).toEqual({})
  })

  it('returns first_name only for single word', () => {
    expect(parseName('McGregor')).toEqual({ first_name: 'McGregor' })
  })

  it('returns first_name and last_name for multiple words', () => {
    expect(parseName('John Doe')).toEqual({
      first_name: 'John',
      last_name: 'Doe',
    })
  })

  it('returns first word as first_name and rest as last_name', () => {
    expect(parseName('Mary Jane Watson')).toEqual({
      first_name: 'Mary',
      last_name: 'Jane Watson',
    })
  })

  it('trims leading and trailing whitespace', () => {
    expect(parseName('  John  ')).toEqual({ first_name: 'John' })
  })
})

describe('createInstantlyLead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('POSTs to Instantly with campaign, email, and skip_if_in_campaign', async () => {
    await createInstantlyLead(
      { email: 'user@test.com', name: 'Test User' },
      'api-key',
    )

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.instantly.ai/api/v2/leads',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer api-key',
        },
        body: JSON.stringify({
          campaign: FALLBACK_CAMPAIGN_ID,
          email: 'user@test.com',
          first_name: 'Test',
          skip_if_in_campaign: true,
        }),
      }),
    )
  })

  it('uses mapped campaign ID when latitudeGoal is provided', async () => {
    await createInstantlyLead(
      {
        email: 'goal@test.com',
        name: 'Goal User',
        latitudeGoal: LatitudeGoal.ImprovingAccuracy,
      },
      'api-key',
    )

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string)
    expect(body.campaign).toBe('df56b6eb-a71b-4be9-99d9-75d5b0cb5ce3')
    expect(body.email).toBe('goal@test.com')
  })

  it('uses fallback campaign ID for unmapped goal', async () => {
    await createInstantlyLead(
      {
        email: 'other@test.com',
        latitudeGoal: LatitudeGoal.Other,
      },
      'api-key',
    )

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string)
    expect(body.campaign).toBe(FALLBACK_CAMPAIGN_ID)
  })

  it('sends single-word name as first_name only', async () => {
    await createInstantlyLead(
      { email: 'surname@test.com', name: 'McGregor' },
      'api-key',
    )

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string)
    expect(body.first_name).toBe('McGregor')
    expect(body).not.toHaveProperty('last_name')
  })

  it('does not include first_name when name is empty', async () => {
    await createInstantlyLead({ email: 'noname@test.com' }, 'api-key')

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string)
    expect(body).toEqual({
      campaign: FALLBACK_CAMPAIGN_ID,
      email: 'noname@test.com',
      skip_if_in_campaign: true,
    })
  })

  it('does not call fetch when email is empty', async () => {
    await createInstantlyLead({ email: '' }, 'api-key')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not call fetch when email is whitespace only', async () => {
    await createInstantlyLead({ email: '   ' }, 'api-key')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls captureException when response is not ok', async () => {
    const { captureException } = await import('../../utils/datadogCapture')
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad request'),
    })

    await createInstantlyLead(
      { email: 'fail@test.com', name: 'Fail' },
      'api-key',
    )

    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(expect.any(Error))
    const err = (captureException as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as Error
    expect(err.message).toContain('fail@test.com')
    expect(err.message).toContain('Bad request')
  })

  it('calls captureException when fetch throws', async () => {
    const { captureException } = await import('../../utils/datadogCapture')
    mockFetch.mockRejectedValue(new Error('Network error'))

    await createInstantlyLead(
      { email: 'throw@test.com', name: 'Throw' },
      'api-key',
    )

    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Network error' }),
    )
  })
})
