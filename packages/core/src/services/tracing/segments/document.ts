import {
  ATTR_GEN_AI_REQUEST_PARAMETERS,
  ATTR_GEN_AI_REQUEST_TEMPLATE,
  DocumentSegmentMetadata,
  SEGMENT_SPECIFICATIONS,
  SegmentType,
  SegmentWithDetails,
  SpanAttribute,
  SpanType,
  SpanWithDetails,
} from '../../../browser'
import { database } from '../../../client'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'
import { isFirst, SegmentProcessArgs } from './shared'
import { StepSegmentSpecification } from './step'

const specification = SEGMENT_SPECIFICATIONS[SegmentType.Document]
export const DocumentSegmentSpecification = {
  ...specification,
  process: process,
}

async function process(
  state: SegmentProcessArgs<SegmentType.Document>,
  db = database,
) {
  const processing = await StepSegmentSpecification.process(
    state as unknown as SegmentProcessArgs<SegmentType.Step>,
    db,
  )
  if (processing.error) return Result.error(processing.error)
  const { configuration, input, output } = processing.value

  const computingpr = computePrompt(state)
  if (computingpr.error) return Result.error(computingpr.error)
  const prompt = computingpr.value

  const computepa = computeParameters(state)
  if (computepa.error) return Result.error(computepa.error)
  const parameters = computepa.value

  return Result.ok({
    configuration: configuration,
    input: input,
    output: output,
    prompt: prompt,
    parameters: parameters,
  })
}

function extractPrompt(
  attributes: Record<string, SpanAttribute>,
): TypedResult<DocumentSegmentMetadata['prompt']> {
  const prompt = String(attributes[ATTR_GEN_AI_REQUEST_TEMPLATE] ?? '')
  if (prompt) return Result.ok(prompt)

  return Result.ok('')
}

function computePrompt({
  child,
  current,
  run,
  document,
}: SegmentProcessArgs<SegmentType.Document>): TypedResult<
  DocumentSegmentMetadata['prompt']
> {
  let prompt = current?.metadata?.prompt
  if (isFirst(current, child, 'documents')) {
    if (child.type === SpanType.Segment) {
      const segment = child as SpanWithDetails<SpanType.Segment>
      const extracting = extractPrompt(segment.metadata?.attributes ?? {})
      if (extracting.error) return Result.error(extracting.error)
      prompt = extracting.value
    } else if (child.type === SegmentType.Document) {
      const document = child as SegmentWithDetails<SegmentType.Document>
      prompt = document.metadata?.prompt
    }
  }

  if (!prompt) prompt = run?.metadata?.prompt
  if (!prompt) prompt = document.content
  if (!prompt) prompt = current?.metadata?.prompt
  if (!prompt) return Result.ok('')

  return Result.ok(prompt)
}

function extractParameters(
  attributes: Record<string, SpanAttribute>,
): TypedResult<DocumentSegmentMetadata['parameters']> {
  const attribute = String(attributes[ATTR_GEN_AI_REQUEST_PARAMETERS] ?? '')
  if (attribute) {
    try {
      return Result.ok(JSON.parse(attribute))
    } catch (error) {
      return Result.error(
        new UnprocessableEntityError('Invalid prompt parameters'),
      )
    }
  }

  return Result.ok({})
}

function computeParameters({
  child,
  current,
  run,
}: SegmentProcessArgs<SegmentType.Document>): TypedResult<
  DocumentSegmentMetadata['parameters']
> {
  let parameters = current?.metadata?.parameters
  if (isFirst(current, child, 'documents')) {
    if (child.type === SpanType.Segment) {
      const segment = child as SpanWithDetails<SpanType.Segment>
      const extracting = extractParameters(segment.metadata?.attributes ?? {})
      if (extracting.error) return Result.error(extracting.error)
      parameters = extracting.value
    } else if (child.type === SegmentType.Document) {
      const document = child as SegmentWithDetails<SegmentType.Document>
      parameters = document.metadata?.parameters
    }
  }

  if (!parameters) parameters = run?.metadata?.parameters
  if (!parameters) parameters = current?.metadata?.parameters
  if (!parameters) return Result.ok({})

  return Result.ok(parameters)
}
