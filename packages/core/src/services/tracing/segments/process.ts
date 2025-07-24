// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/* eslint-disable */

import { differenceInMilliseconds, isAfter, isBefore } from 'date-fns'
import { scan } from 'promptl-ai'
import {
  ApiKey,
  DocumentType,
  EvaluationType,
  EvaluationV2,
  Segment,
  SEGMENT_METADATA_STORAGE_KEY,
  SegmentBaggage,
  SegmentMetadata,
  SegmentSource,
  SegmentType,
  SpanStatus,
  SpanType,
  SpanWithDetails,
  TRACING_JOBS_MAX_ATTEMPTS,
  Workspace,
} from '../../../browser'
import { cache as redis } from '../../../cache'
import { database } from '../../../client'
import { publisher } from '../../../events/publisher'
import { processSegmentJobKey } from '../../../jobs/job-definitions/tracing/processSegmentJob'
import { tracingQueue } from '../../../jobs/queues'
import { diskFactory, DiskWrapper } from '../../../lib/disk'
import { ConflictError, UnprocessableEntityError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  SegmentMetadatasRepository,
  SegmentsRepository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../repositories'
import { segments } from '../../../schema'
import {
  hashContent,
  inheritField,
  isFirst,
  isLast,
  SegmentProcessArgs,
} from './shared'
import { SEGMENT_SPECIFICATIONS } from './specifications'

export async function processSegment(
  args: {
    segment: SegmentBaggage
    chain: SegmentBaggage[]
    childId: string
    childType: 'span' | 'segment'
    traceId: string
    apiKey: ApiKey
    workspace: Workspace
  },
  transaction = new Transaction(),
  disk: DiskWrapper = diskFactory('private'),
) {
  const validating = validateSegmentChain(args.segment, args.chain)
  if (validating.error) return Result.error(validating.error)

  const getting = await getState(args, disk)
  if (getting.error) return Result.error(getting.error)
  const state = getting.value

  const id = state.current?.id ?? state.segment.id

  const traceId = state.current?.traceId ?? state.traceId

  const parentId = state.current?.parentId ?? state.chain.at(-1)?.id

  const type = state.current?.type ?? state.segment.type

  // const specification = SEGMENT_SPECIFICATIONS[type]
  // if (!specification) {
  //   return Result.error(new UnprocessableEntityError('Invalid segment type'))
  // }

  // let metadata = {
  //   ...({
  //     traceId: traceId,
  //     segmentId: id,
  //     type: type,
  //   } satisfies BaseSegmentMetadata),
  // } as SegmentMetadata

  // // @ts-expect-error seems typescript cannot infer that state types are the same
  // const processing = await specification.process(state, tx)
  // if (processing.error) return Result.error(processing.error)
  // metadata = { ...metadata, ...processing.value }

  // // Note: edge case when the global document segment is being processed right now for the first time
  // if (metadata.type === SegmentType.Document) {
  //   state.run = { metadata } as SegmentWithDetails<SegmentType.Document>
  // }

  // const computingei = computeExternalId(state)
  // if (computingei.error) return Result.error(computingei.error)
  // const externalId = computingei.value

  // const enrichingnm = enrichName(state)
  // if (enrichingnm.error) return Result.error(enrichingnm.error)
  // const name = enrichingnm.value

  // const computingsc = computeSource(state)
  // if (computingsc.error) return Result.error(computingsc.error)
  // const source = computingsc.value

  // const computingst = computeStatus(state)
  // if (computingst.error) return Result.error(computingst.error)
  // const { status, message } = computingst.value

  const computinglu = computeLogUuid(state)
  if (computinglu.error) return Result.error(computinglu.error)
  const logUuid = computinglu.value

  // const computingdc = computeDocument(state)
  // if (computingdc.error) return Result.error(computingdc.error)
  // const { commitUuid, documentUuid, documentHash,
  //       documentType, provider, model } = computingdc.value // prettier-ignore

  // const computingeu = computeExperimentUuid(state)
  // if (computingeu.error) return Result.error(computingeu.error)
  // const experimentUuid = computingeu.value

  // const computingsa = computeStatistics(state)
  // if (computingsa.error) return Result.error(computingsa.error)
  // const { tokens, cost, duration } = computingsa.value

  // const computingts = computeTimestamps(state)
  // if (computingts.error) return Result.error(computingts.error)
  // const { startedAt, endedAt } = computingts.value

  return await transaction.call(async (tx) => {
    const repository = new SegmentsRepository(args.workspace.id, tx)
    const locking = await repository.lock({ segmentId: id, traceId })
    if (locking.error) {
      return Result.error(new ConflictError('Segment processing data race'))
    }

    // const saving = await saveMetadata({ metadata, workspace: args.workspace }, disk) // prettier-ignore
    // if (saving.error) return Result.error(saving.error)

    // TODO(tracing): temporal segment fixing patch
    const fields = {
      ...(state.current ?? {}),
      id: id,
      traceId: traceId,
      parentId: parentId,
      workspaceId: args.workspace.id,
      apiKeyId: args.apiKey.id,
      externalId: undefined, // externalId,
      name: 'name', // name,
      source: SegmentSource.API, // source,
      type: type,
      status: SpanStatus.Ok, // status,
      message: undefined, // message,
      logUuid: logUuid,
      commitUuid: '7fdf3f27-ed4e-4710-a8fd-90b4121e2106', // commitUuid,
      documentUuid: '7fdf3f27-ed4e-4710-a8fd-90b4121e2106', // documentUuid,
      documentHash: 'documentHash', // documentHash,
      documentType: DocumentType.Prompt, // documentType,
      experimentUuid: undefined, // experimentUuid,
      provider: 'provider', // provider,
      model: 'model', // model,
      tokens: 0, // tokens,
      cost: 0, // cost,
      duration: 0, // duration,
      startedAt: new Date(), // startedAt,
      endedAt: new Date(), // endedAt,
    }

    const segment = (await tx
      .insert(segments)
      .values({
        ...fields,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [segments.id],
        set: {
          ...fields,
          id: undefined,
          traceId: undefined,
          createdAt: undefined,
          updatedAt: new Date(),
        },
      })
      .returning()
      .then((r) => r[0]!)) as Segment

    if (state.current) {
      await publisher.publishLater({
        type: 'segmentUpdated',
        data: {
          segmentId: segment.id,
          apiKeyId: args.apiKey.id,
          workspaceId: args.workspace.id,
        },
      })
    } else {
      await publisher.publishLater({
        type: 'segmentCreated',
        data: {
          segmentId: segment.id,
          apiKeyId: args.apiKey.id,
          workspaceId: args.workspace.id,
        },
      })
    }

    const parent = state.chain.pop()
    if (parent) {
      const payload = {
        segment: parent,
        chain: state.chain,
        childId: segment.id,
        childType: 'segment' as const,
        traceId: state.traceId,
        apiKeyId: args.apiKey.id,
        workspaceId: args.workspace.id,
      }

      await tracingQueue.add('processSegmentJob', payload, {
        attempts: TRACING_JOBS_MAX_ATTEMPTS,
        deduplication: {
          id: processSegmentJobKey(payload, {
            ...segment,
            metadata: undefined,
          }),
        },
      })
    }

    return Result.ok({ segment: { ...segment, metadata: undefined } })
  })
}

function validateSegmentChain(
  segment: SegmentBaggage,
  chain: SegmentBaggage[],
): TypedResult {
  let current = segment.id
  let parent = segment.parentId

  for (let i = chain.length - 1; i >= 0; i--) {
    current = chain[i]!.id
    if (current !== parent) {
      return Result.error(new UnprocessableEntityError('Invalid segment chain'))
    }
    parent = chain[i]!.parentId
  }

  return Result.nil()
}

async function getCurrentState(
  {
    segment: { id },
    traceId,
    workspace,
  }: {
    segment: SegmentBaggage
    traceId: string
    workspace: Workspace
  },
  db = database,
  disk: DiskWrapper,
): Promise<TypedResult<SegmentProcessArgs['current']>> {
  const segmentsRepository = new SegmentsRepository(workspace.id, db)
  const gettingse = await segmentsRepository.get({ segmentId: id, traceId })
  if (gettingse.error) return Result.error(gettingse.error)
  const segment = gettingse.value

  if (!segment) return Result.nil()

  const gettingts = await segmentsRepository.getTimestamps({ segmentId: id, traceId }) // prettier-ignore
  if (gettingts.error) return Result.error(gettingts.error)
  const timestamps = gettingts.value

  const metadatasRepository = new SegmentMetadatasRepository(workspace.id, disk)
  const gettingmt = await metadatasRepository.get({ segmentId: id, traceId, fresh: true }) // prettier-ignore
  if (gettingmt.error) return Result.error(gettingmt.error)
  const metadata = gettingmt.value

  return Result.ok({ ...segment, ...timestamps, metadata } as SegmentProcessArgs['current']) // prettier-ignore
}

async function getRunState(
  {
    segment: { id },
    traceId,
    workspace,
  }: {
    segment: SegmentBaggage
    traceId: string
    workspace: Workspace
  },
  db = database,
  disk: DiskWrapper,
): Promise<TypedResult<SegmentProcessArgs['run']>> {
  const segmentsRepository = new SegmentsRepository(workspace.id, db)
  const finding = await segmentsRepository.getRun({ segmentId: id, traceId })
  if (finding.error) return Result.error(finding.error)
  const segment = finding.value

  if (!segment) return Result.nil()

  const metadatasRepository = new SegmentMetadatasRepository(workspace.id, disk)
  const getting = await metadatasRepository.get({ segmentId: id, traceId, fresh: true }) // prettier-ignore
  if (getting.error) return Result.error(getting.error)
  const metadata = getting.value

  return Result.ok({ ...segment, metadata } as SegmentProcessArgs['run'])
}

async function getChildState(
  {
    childId,
    childType,
    traceId,
    workspace,
  }: {
    childId: string
    childType: 'span' | 'segment'
    traceId: string
    workspace: Workspace
  },
  db = database,
  disk: DiskWrapper,
): Promise<TypedResult<SegmentProcessArgs['child']>> {
  if (childType === 'span') {
    const spansRepository = new SpansRepository(workspace.id, db)
    const gettingsp = await spansRepository.get({ spanId: childId, traceId }) // prettier-ignore
    if (gettingsp.error) return gettingsp.error
    const span = gettingsp.value

    const metadatasRepository = new SpanMetadatasRepository(workspace.id, disk)
    const gettingmt = await metadatasRepository.get({ spanId: childId, traceId, fresh: true }) // prettier-ignore
    if (gettingmt.error) return gettingmt.error
    const metadata = gettingmt.value

    return Result.ok({ ...span, metadata } as SegmentProcessArgs['child'])
  } else {
    const segmentsRepository = new SegmentsRepository(workspace.id, db)
    const gettingse = await segmentsRepository.get({ segmentId: childId, traceId }) // prettier-ignore
    if (gettingse.error) return gettingse.error
    const segment = gettingse.value

    const metadatasRepository = new SegmentMetadatasRepository(workspace.id, disk) // prettier-ignore
    const gettingmt = await metadatasRepository.get({ segmentId: childId, traceId, fresh: true }) // prettier-ignore
    if (gettingmt.error) return gettingmt.error
    const metadata = gettingmt.value

    return Result.ok({ ...segment, metadata } as SegmentProcessArgs['child'])
  }
}

async function getState(
  {
    segment,
    chain,
    childId,
    childType,
    traceId,
    apiKey,
    workspace,
  }: {
    segment: SegmentBaggage
    chain: SegmentBaggage[]
    childId: string
    childType: 'span' | 'segment'
    traceId: string
    apiKey: ApiKey
    workspace: Workspace
  },
  disk: DiskWrapper,
  db = database,
): Promise<TypedResult<SegmentProcessArgs>> {
  const gettingcs = await getCurrentState(
    { segment, traceId, workspace },
    db,
    disk,
  )
  if (gettingcs.error) return Result.error(gettingcs.error)
  const current = gettingcs.value

  const gettingrs = await getRunState({ segment, traceId, workspace }, db, disk)
  if (gettingrs.error) return Result.error(gettingrs.error)
  const run = gettingrs.value

  const gettinghs = await getChildState(
    { childId, childType, traceId, workspace },
    db,
    disk,
  )
  if (gettinghs.error) return Result.error(gettinghs.error)
  const child = gettinghs.value

  let source = segment.source as SegmentSource | undefined
  if (!source) source = inheritField<SegmentSource>('source', chain)
  if (!source) source = run?.source
  if (!source) source = current?.source
  if (!source) {
    return Result.error(
      new UnprocessableEntityError('Segment source is required'),
    )
  }

  let commitUuid = segment.data?.commitUuid
  if (!commitUuid) commitUuid = inheritField<string>('commitUuid', chain) // prettier-ignore
  if (!commitUuid) commitUuid = run?.commitUuid
  if (!commitUuid) commitUuid = current?.commitUuid
  if (!commitUuid) {
    return Result.error(new UnprocessableEntityError('Commit uuid is required'))
  }

  let documentUuid = segment.data?.documentUuid
  if (!documentUuid) documentUuid = inheritField<string>('documentUuid', chain) // prettier-ignore
  if (!documentUuid) documentUuid = run?.documentUuid
  if (!documentUuid) documentUuid = current?.documentUuid
  if (!documentUuid) {
    return Result.error(
      new UnprocessableEntityError('Document uuid is required'),
    )
  }

  const commitsRepository = new CommitsRepository(workspace.id, db)
  const gettingco = await commitsRepository.getCommitByUuid({
    uuid: commitUuid,
  })
  if (gettingco.error) return Result.error(gettingco.error)
  const commit = gettingco.value

  let document
  let evaluation
  if (source === SegmentSource.Evaluation) {
    // TODO(tracing): we actually don't have the a repository method
    // to get the versioned evaluation without the document uuid
    evaluation = undefined as unknown as EvaluationV2<EvaluationType.Llm>
  } else {
    const documentsRepository = new DocumentVersionsRepository(workspace.id, db)
    const getting = await documentsRepository.getDocumentAtCommit({
      commitUuid: commitUuid,
      documentUuid: documentUuid,
    })
    if (getting.error) return Result.error(getting.error)

    const scanning = await scan({ prompt: getting.value.content })

    document = { ...getting.value, config: scanning.config }
  }

  return Result.ok({
    segment: segment,
    chain: chain,
    child: child,
    traceId: traceId,
    current: current,
    run: run,
    document: document,
    evaluation: evaluation,
    commit: commit,
    apiKey: apiKey,
    workspace: workspace,
  })
}

function computeExternalId({
  segment,
  chain,
  current,
  run,
}: SegmentProcessArgs): TypedResult<string | undefined> {
  let externalId = segment.data?.externalId
  if (!externalId) externalId = inheritField<string>('externalId', chain)
  if (!externalId) externalId = run?.externalId
  if (!externalId) externalId = current?.externalId
  if (!externalId) return Result.nil()

  return Result.ok(externalId)
}

function enrichName({
  segment,
  document,
  evaluation,
}: SegmentProcessArgs): TypedResult<string> {
  let name = SEGMENT_SPECIFICATIONS[segment.type].name
  if (segment.type === SegmentType.Document) {
    if (document) name = document.path.split('/').pop()!
    if (evaluation) name = evaluation.name
  }

  name = name.slice(0, 128)
  return Result.ok(name)
}

function computeSource({
  segment,
  chain,
  current,
  run,
}: SegmentProcessArgs): TypedResult<SegmentSource> {
  let source = segment.source as SegmentSource | undefined
  if (!source) source = inheritField<SegmentSource>('source', chain)
  if (!source) source = run?.source
  if (!source) source = current?.source
  if (!source) {
    return Result.error(
      new UnprocessableEntityError('Segment source is required'),
    )
  }

  return Result.ok(source)
}

function computeStatus({ child, current }: SegmentProcessArgs): TypedResult<{
  status: SpanStatus
  message?: string
}> {
  if (child.status === SpanStatus.Error) {
    if (current?.status !== SpanStatus.Error) {
      return Result.ok({ status: child.status, message: child.message })
    }
    if (isLast(current, child, 'errors')) {
      return Result.ok({ status: child.status, message: child.message })
    }
  } else {
    if (current?.status === SpanStatus.Error) {
      return Result.ok({ status: current.status, message: current.message })
    }
    if (isLast(current, child, 'children')) {
      return Result.ok({ status: child.status, message: child.message })
    }
  }

  if (!current?.status) {
    return Result.error(
      new UnprocessableEntityError('Segment status is required'),
    )
  }

  return Result.ok({ status: current.status, message: current.message })
}

function computeLogUuid({
  segment,
  chain,
  current,
  run,
}: SegmentProcessArgs): TypedResult<string | undefined> {
  let logUuid = segment.data?.logUuid
  if (!logUuid) logUuid = inheritField<string>('logUuid', chain)
  if (!logUuid) logUuid = run?.logUuid
  if (!logUuid) logUuid = current?.logUuid
  if (!logUuid) return Result.nil()

  return Result.ok(logUuid)
}

function computeDocument({
  segment,
  chain,
  child,
  current,
  run,
  document,
  evaluation,
  commit,
}: SegmentProcessArgs): TypedResult<{
  commitUuid: string
  documentUuid: string
  documentHash: string
  documentType: DocumentType
  provider: string
  model: string
}> {
  let commitUuid = segment.data?.commitUuid
  if (!commitUuid) commitUuid = inheritField<string>('commitUuid', chain)
  if (!commitUuid) commitUuid = run?.commitUuid
  if (!commitUuid) commitUuid = commit.uuid
  if (!commitUuid) commitUuid = current?.commitUuid
  if (!commitUuid) {
    return Result.error(new UnprocessableEntityError('Commit uuid is required'))
  }

  let documentUuid = segment.data?.documentUuid
  if (!documentUuid) documentUuid = inheritField<string>('documentUuid', chain)
  if (!documentUuid) documentUuid = run?.documentUuid
  if (!documentUuid) documentUuid = document?.documentUuid
  if (!documentUuid) documentUuid = evaluation?.uuid
  if (!documentUuid) documentUuid = current?.documentUuid
  if (!documentUuid) {
    return Result.error(
      new UnprocessableEntityError('Document uuid is required'),
    )
  }

  let documentHash = run?.documentHash
  if (!documentHash) documentHash = hashContent(run?.metadata?.prompt)
  if (!documentHash) documentHash = hashContent(document?.content)
  if (!documentHash) documentHash = hashContent(evaluation?.name) // TODO(tracing): compute evaluation prompt
  if (!documentHash) documentHash = current?.documentHash
  if (!documentHash) documentHash = 'TODO' // TODO(tracing): fix spans from evaluations
  if (!documentHash) {
    return Result.error(
      new UnprocessableEntityError('Document hash is required'),
    )
  }

  let documentType = run?.documentType
  if (!documentType) documentType = run?.metadata?.configuration.type as DocumentType // prettier-ignore
  if (!documentType) documentType = document?.documentType
  if (!documentType) documentType = evaluation ? DocumentType.Prompt : undefined // TODO(tracing): compute evaluation prompt
  if (!documentType) documentType = current?.documentType
  if (!documentType) documentType = DocumentType.Prompt // TODO(tracing): fix spans from evaluations
  if (!documentType) {
    return Result.error(
      new UnprocessableEntityError('Document type is required'),
    )
  }

  let provider = current?.provider
  if (isFirst(current, child, 'completions')) {
    if ('provider' in child) provider = child.provider
    else if (child.type === SpanType.Completion) {
      const completion = child as SpanWithDetails<SpanType.Completion>
      provider = completion.metadata?.provider
    }
  }

  if (!provider) provider = run?.provider
  if (!provider) provider = run?.metadata?.configuration.provider as string
  if (!provider) provider = document?.config.provider as string
  if (!provider) provider = evaluation?.configuration.provider
  if (!provider) provider = current?.provider
  if (!provider) {
    return Result.error(new UnprocessableEntityError('Provider is required'))
  }

  let model = current?.model
  if (isFirst(current, child, 'completions')) {
    if ('model' in child) model = child.model
    else if (child.type === SpanType.Completion) {
      const completion = child as SpanWithDetails<SpanType.Completion>
      model = completion.metadata?.model
    }
  }

  if (!model) model = run?.model
  if (!model) model = run?.metadata?.configuration.model as string
  if (!model) model = document?.config.model as string
  if (!model) model = evaluation?.configuration.model
  if (!model) model = current?.model
  if (!model) {
    return Result.error(new UnprocessableEntityError('Model is required'))
  }

  return Result.ok({
    commitUuid: commitUuid,
    documentUuid: documentUuid,
    documentHash: documentHash,
    documentType: documentType,
    provider: provider,
    model: model,
  })
}

function computeExperimentUuid({
  segment,
  chain,
  current,
  run,
}: SegmentProcessArgs): TypedResult<string | undefined> {
  let experimentUuid = segment.data?.experimentUuid
  if (!experimentUuid) {
    experimentUuid = inheritField<string>('experimentUuid', chain)
  }
  if (!experimentUuid) experimentUuid = run?.experimentUuid
  if (!experimentUuid) experimentUuid = current?.experimentUuid
  if (!experimentUuid) return Result.nil()

  return Result.ok(experimentUuid)
}

function computeStatistics({
  child,
  current,
  ...rest
}: SegmentProcessArgs): TypedResult<{
  tokens: number
  cost: number
  duration: number
}> {
  const computing = computeTimestamps({ child, current, ...rest })
  if (computing.error) return Result.error(computing.error)
  const { startedAt, endedAt } = computing.value

  let tokens = current?.tokens ?? 0
  let cost = current?.cost ?? 0
  let duration = current?.duration ?? 0

  if ('tokens' in child) tokens += child.tokens
  else if (child.type === SpanType.Completion) {
    const completion = child as SpanWithDetails<SpanType.Completion>
    const usage = completion.metadata?.tokens
    tokens +=
      (usage?.prompt ?? 0) +
      (usage?.cached ?? 0) +
      (usage?.reasoning ?? 0) +
      (usage?.completion ?? 0)
  }

  if ('cost' in child) cost += child.cost
  else if (child.type === SpanType.Completion) {
    const completion = child as SpanWithDetails<SpanType.Completion>
    const usage = completion.metadata?.cost
    cost += usage ?? 0
  }

  // Note: duration must be computing by substracting the timestamps rather than
  // adding the child duration because there could be empty time between children
  duration = differenceInMilliseconds(endedAt, startedAt)
  if (duration < 0) {
    return Result.error(
      new UnprocessableEntityError('Invalid segment duration'),
    )
  }

  return Result.ok({ tokens, cost, duration })
}

function computeTimestamps({
  child,
  current,
}: SegmentProcessArgs): TypedResult<{
  startedAt: Date
  endedAt: Date
}> {
  let startedAt = current?.startedAt ?? child.startedAt
  let endedAt = current?.endedAt ?? child.endedAt

  if (current) {
    if (isBefore(child.startedAt, current.startedAt)) {
      startedAt = child.startedAt
    }
    if (isAfter(child.endedAt, current.endedAt)) {
      endedAt = child.endedAt
    }
  }

  if (isAfter(startedAt, endedAt)) {
    return Result.error(
      new UnprocessableEntityError('Invalid segment timestamps'),
    )
  }

  return Result.ok({ startedAt, endedAt })
}

async function saveMetadata(
  {
    metadata,
    workspace,
  }: {
    metadata: SegmentMetadata
    workspace: Workspace
  },
  disk: DiskWrapper,
): Promise<TypedResult> {
  const key = SEGMENT_METADATA_STORAGE_KEY(
    workspace.id,
    metadata.traceId,
    metadata.segmentId,
  )
  const cache = await redis()

  try {
    const payload = JSON.stringify(metadata)
    await disk.put(key, payload).then((r) => r.unwrap())
    await cache.del(key)
  } catch (error) {
    return Result.error(error as Error)
  }

  return Result.nil()
}
