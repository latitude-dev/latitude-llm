import { describe, it, expect } from 'vitest'
import { buildConfigFieldName, buildProviderPayload } from './buildProviderPayload'
import { Providers } from '@latitude-data/constants'

describe('buildProviderPayload', () => {
  it('should build payload for a non-vertex provider', () => {
    // Create a FormData instance for a provider that is not Vertex.
    const formData = new FormData()
    formData.append('name', 'Test Provider')
    formData.append('provider', Providers.OpenAI)
    formData.append('token', 'secret')
    formData.append('defaultModel', 'gpt-3.5-turbo')

    // Call the function under test.
    const payload = buildProviderPayload({
      formData,
    })

    // Expect that only the common fields (name, provider, defaultModel, etc.) are present.
    expect(payload).toEqual({
      name: 'Test Provider',
      provider: Providers.OpenAI,
      defaultModel: 'gpt-3.5-turbo',
      token: 'secret',
    })
  })

  it('should build payload for a vertex provider with nested configuration', () => {
    const formData = new FormData()
    formData.append('name', 'Vertex Provider')
    formData.append('provider', Providers.GoogleVertex)
    formData.append('defaultModel', 'gemini-1.5-flash-001')

    // Append configuration keys using bracket notation.
    formData.append(
      buildConfigFieldName({
        fieldNamespace: 'project',
      }),
      'project',
    )
    formData.append(
      buildConfigFieldName({
        fieldNamespace: 'location',
      }),
      'us-central-1',
    )
    formData.append(
      buildConfigFieldName({
        fieldNamespace: '[googleCredentials][clientEmail]',
      }),
      'someEmail',
    )
    formData.append(
      buildConfigFieldName({
        fieldNamespace: '[googleCredentials][privateKeyId]',
      }),
      'priv key ID',
    )
    formData.append(
      buildConfigFieldName({
        fieldNamespace: '[googleCredentials][privateKey]',
      }),
      'Super secret',
    )

    const payload = buildProviderPayload({
      formData,
    })

    expect(payload).toEqual({
      name: 'Vertex Provider',
      provider: Providers.GoogleVertex,
      defaultModel: 'gemini-1.5-flash-001',
      configuration: {
        project: 'project',
        location: 'us-central-1',
        googleCredentials: {
          clientEmail: 'someEmail',
          privateKeyId: 'priv key ID',
          privateKey: 'Super secret',
        },
      },
    })
  })
})
