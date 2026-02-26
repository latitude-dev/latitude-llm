import {
  ExternalSpanMetadata,
  LogSources,
  SPAN_SPECIFICATIONS,
  SpanType,
  BaseSpanMetadata,
  ATTRIBUTES,
} from '../../../../constants'
import { TypedResult } from '../../../../lib/Result'
import { ExternalSpanSpecification } from './external'
import { SpanBackendSpecification, SpanProcessArgs } from '../shared'
import { omit } from 'lodash-es'

const specification = SPAN_SPECIFICATIONS[SpanType.UnresolvedExternal]

type ExternalMetadataResult = TypedResult<
  Omit<ExternalSpanMetadata, keyof BaseSpanMetadata>
>

export const UnresolvedExternalSpanSpecification: SpanBackendSpecification<SpanType.UnresolvedExternal> =
  {
    ...specification,
    process:
      process as SpanBackendSpecification<SpanType.UnresolvedExternal>['process'],
  }

async function process({
  attributes,
  workspace,
  ...rest
}: SpanProcessArgs<SpanType.UnresolvedExternal>): Promise<ExternalMetadataResult> {
  const passthroughAttributes = {
    ...omit(attributes, [ATTRIBUTES.LATITUDE.promptPath]),
    [ATTRIBUTES.LATITUDE.source]:
      attributes[ATTRIBUTES.LATITUDE.source] ?? LogSources.API,
  }

  return ExternalSpanSpecification.process({
    attributes: passthroughAttributes,
    workspace,
    ...rest,
  } as SpanProcessArgs<SpanType.External>)
}
