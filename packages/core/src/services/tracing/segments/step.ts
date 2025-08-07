import { SEGMENT_SPECIFICATIONS, SegmentType, type StepSegmentMetadata } from '../../../browser'
import { database } from '../../../client'
import { Result, type TypedResult } from '../../../lib/Result'
import {
  type CompletionPart,
  isCompletionPart,
  isFirst,
  isLast,
  type SegmentProcessArgs,
} from './shared'

const specification = SEGMENT_SPECIFICATIONS[SegmentType.Step]
export const StepSegmentSpecification = {
  ...specification,
  process: process,
}

async function process(state: SegmentProcessArgs<SegmentType.Step>, _ = database) {
  const computingcg = computeConfiguration(state)
  if (computingcg.error) return Result.error(computingcg.error)
  const configuration = computingcg.value

  const computingin = computeInput(state)
  if (computingin.error) return Result.error(computingin.error)
  const input = computingin.value

  const computingou = computeOutput(state)
  if (computingou.error) return Result.error(computingou.error)
  const output = computingou.value

  return Result.ok({
    configuration: configuration,
    input: input,
    output: output,
  })
}

function computeConfiguration({
  child,
  current,
}: SegmentProcessArgs<SegmentType.Step>): TypedResult<StepSegmentMetadata['configuration']> {
  let configuration = current?.metadata?.configuration
  if (isFirst(current, child, 'completions')) {
    if (isCompletionPart(child)) {
      const completion = child as CompletionPart
      configuration = completion.metadata?.configuration
    }
  }
  if (!configuration) return Result.ok({})

  return Result.ok(configuration)
}

function computeInput({
  child,
  current,
}: SegmentProcessArgs<SegmentType.Step>): TypedResult<StepSegmentMetadata['input']> {
  let input = current?.metadata?.input
  if (isFirst(current, child, 'completions')) {
    if (isCompletionPart(child)) {
      const completion = child as CompletionPart
      input = completion.metadata?.input
    }
  }
  if (!input) return Result.ok([])

  return Result.ok(input)
}

function computeOutput({
  child,
  current,
}: SegmentProcessArgs<SegmentType.Step>): TypedResult<StepSegmentMetadata['output']> {
  let output = current?.metadata?.output
  if (isLast(current, child, 'completions')) {
    if (isCompletionPart(child)) {
      const completion = child as CompletionPart
      output = completion.metadata?.output
    }
  }
  if (!output) return Result.nil()

  return Result.ok(output)
}
