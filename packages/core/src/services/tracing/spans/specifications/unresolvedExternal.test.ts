import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTES,
  LogSources,
  Otlp,
  SpanStatus,
  SpanType,
} from '../../../../constants'
import { UnresolvedExternalSpanSpecification } from './unresolvedExternal'
import { type ApiKey } from '../../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import * as factories from '../../../../tests/factories'

describe('UnresolvedExternalSpanSpecification', () => {
  it('maps unresolved spans into external metadata fields', async () => {
    const { workspace } = await factories.createWorkspace()
    const { apiKey } = await factories.createApiKey({ workspace })

    const result = await UnresolvedExternalSpanSpecification.process({
      attributes: {
        [ATTRIBUTES.LATITUDE.type]: SpanType.UnresolvedExternal,
        [ATTRIBUTES.LATITUDE.promptPath]: 'capture/path',
        [ATTRIBUTES.LATITUDE.documentUuid]:
          '7f957091-caa1-45f2-b5e5-fad92ddf9348',
        [ATTRIBUTES.LATITUDE.documentLogUuid]:
          'd36ce8a2-8f24-4f4f-b138-a88c76277e2d',
        [ATTRIBUTES.LATITUDE.externalId]: 'external-id',
      },
      status: SpanStatus.Ok,
      scope: { name: 'test-scope', version: '1.0.0' } as Otlp.Scope,
      apiKey: apiKey as ApiKey,
      workspace: workspace as Workspace,
    })

    expect(result.error).toBeUndefined()
    expect(result.value?.promptUuid).toBe(
      '7f957091-caa1-45f2-b5e5-fad92ddf9348',
    )
    expect(result.value?.documentLogUuid).toBe(
      'd36ce8a2-8f24-4f4f-b138-a88c76277e2d',
    )
    expect(result.value?.source).toBe(LogSources.API)
    expect(result.value?.externalId).toBe('external-id')
  })

  it('defaults source to API when missing', async () => {
    const { workspace } = await factories.createWorkspace()
    const { apiKey } = await factories.createApiKey({ workspace })

    const result = await UnresolvedExternalSpanSpecification.process({
      attributes: {
        [ATTRIBUTES.LATITUDE.type]: SpanType.UnresolvedExternal,
        [ATTRIBUTES.LATITUDE.documentUuid]:
          '7f957091-caa1-45f2-b5e5-fad92ddf9348',
        [ATTRIBUTES.LATITUDE.documentLogUuid]:
          'd36ce8a2-8f24-4f4f-b138-a88c76277e2d',
      },
      status: SpanStatus.Ok,
      scope: { name: 'test-scope', version: '1.0.0' } as Otlp.Scope,
      apiKey: apiKey as ApiKey,
      workspace: workspace as Workspace,
    })

    expect(result.error).toBeUndefined()
    expect(result.value?.source).toBe(LogSources.API)
  })

  it('preserves provided source', async () => {
    const { workspace } = await factories.createWorkspace()
    const { apiKey } = await factories.createApiKey({ workspace })

    const result = await UnresolvedExternalSpanSpecification.process({
      attributes: {
        [ATTRIBUTES.LATITUDE.type]: SpanType.UnresolvedExternal,
        [ATTRIBUTES.LATITUDE.documentUuid]:
          '7f957091-caa1-45f2-b5e5-fad92ddf9348',
        [ATTRIBUTES.LATITUDE.documentLogUuid]:
          'd36ce8a2-8f24-4f4f-b138-a88c76277e2d',
        [ATTRIBUTES.LATITUDE.source]: LogSources.Playground,
      },
      status: SpanStatus.Ok,
      scope: { name: 'test-scope', version: '1.0.0' } as Otlp.Scope,
      apiKey: apiKey as ApiKey,
      workspace: workspace as Workspace,
    })

    expect(result.error).toBeUndefined()
    expect(result.value?.source).toBe(LogSources.Playground)
  })
})
