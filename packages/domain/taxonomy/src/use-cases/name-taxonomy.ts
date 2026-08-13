import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  buildProjectScopedAiMetadata,
  resolveGenerationConfig,
} from "@domain/ai"
import {
  CacheStore,
  type ChSqlClient,
  type CustomBehaviorId,
  type FacetId,
  LATITUDE_TELEMETRY_PROJECT_SLUGS,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
} from "@domain/shared"
import { Effect, Option } from "effect"
import { z } from "zod"
import {
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_CONTRASTIVE_NAMING_CACHE_TTL_SECONDS,
  TAXONOMY_CONTRASTIVE_NAMING_MAX_TOKENS,
  TAXONOMY_CONTRASTIVE_NAMING_TIMEOUT_MS,
  TAXONOMY_DEFAULT_NAMING_MODEL,
  TAXONOMY_FPS_SAMPLE_BUDGET_MAX,
  TAXONOMY_FPS_SAMPLE_BUDGET_MIN,
  TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
  TAXONOMY_NAMING_CHARS_PER_TOKEN,
  TAXONOMY_NAMING_FORBIDDEN_PROMPT_MAX,
  TAXONOMY_NAMING_PROMPT_TOKEN_BUDGET,
  TAXONOMY_NAMING_SAMPLE_CHAR_FLOOR,
  TAXONOMY_NAMING_SAMPLE_CHAR_MAX,
  TAXONOMY_NAMING_TIMEOUT_MS,
  TAXONOMY_PENDING_DISPLAY_NAME,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyFacet } from "../entities/facet.ts"
import { clamp, farthestPointSample } from "../helpers.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import type { TaxonomyClusterNamingMember } from "../ports/taxonomy-view-assignment-repository.ts"

export interface NameClusterInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyCluster["id"]
  readonly now?: Date
  /**
   * Naming sample for a cluster whose membership is not in ClickHouse yet: a
   * `staging` tree is named before the reassignment repoints assignments at it,
   * so the publish passes the staged plan's own member ids. Omit to read members
   * by `assigned_cluster_id` (the post-publish path).
   */
  readonly memberObservationIds?: readonly string[]
  /**
   * The staged samples for this cluster's sibling group, keyed by cluster id.
   * Contrastive naming needs its siblings' samples too, and a staged sibling's
   * membership is not in ClickHouse yet — without this map a staged tree can only
   * be named per child.
   */
  readonly memberObservationIdsByClusterId?: Readonly<Record<string, readonly string[]>>
  /**
   * Identifies one naming pass over one tree. Contrastive naming parks its
   * siblings' names under it, so a pass that dies before they are consumed cannot
   * leak a name into the next pass over the same (reused) cluster ids. Absent ⇒
   * no cross-cluster naming, because there is nowhere safe to park a result.
   */
  readonly namingPassId?: string
}

export interface NameTaxonomyResult {
  readonly name: string
  readonly description: string
}

const candidateThemesSchema = z.object({
  candidates: z
    .array(z.object({ theme: z.string(), examples: z.array(z.number()) }))
    .min(1)
    .max(5),
})
const finalNameSchema = z.object({ name: z.string().min(3).max(80), description: z.string().min(20).max(280) })

const contrastiveThemesSchema = z.object({
  clusters: z
    .array(
      z.object({
        index: z.number().int(),
        differentiators: z.array(z.string()).min(1).max(4),
      }),
    )
    .min(2),
})
const contrastiveNamesSchema = z.object({
  clusters: z
    .array(
      z.object({
        index: z.number().int(),
        name: z.string().min(3).max(80),
        description: z.string().min(20).max(280),
      }),
    )
    .min(2),
})

const sampleBudget = (count: number): number =>
  Math.round(
    clamp(Math.round(Math.log2(count + 1)) * 2, TAXONOMY_FPS_SAMPLE_BUDGET_MIN, TAXONOMY_FPS_SAMPLE_BUDGET_MAX),
  )

const withNamingTimeout = <A, E, R>(effect: Effect.Effect<A, E, R>, durationMs = TAXONOMY_NAMING_TIMEOUT_MS) =>
  effect.pipe(
    Effect.timeoutOrElse({
      duration: durationMs,
      orElse: () => Effect.fail(new Error("Taxonomy naming timed out")),
    }),
  )

// Real agent transcripts contain literal tool-call tags, and a sample carrying
// one deterministically hijacks the naming model into emitting a tool call
// instead of JSON. Angle brackets are replaced (not stripped) so the text still
// reads as a tag to the model without being parseable as one.
const defangTags = (text: string): string => text.replaceAll("<", "‹").replaceAll(">", "›")

const truncateSample = (sample: string, maxChars: number): string =>
  sample.length <= maxChars ? sample : `${sample.slice(0, maxChars)}…`

/**
 * Samples per child come from this per-call budget, never from the sibling count:
 * a set that cannot be shown at readable sample length is named per child instead
 * of being named jointly on shrunken samples. `null` ⇒ over budget.
 */
const contrastiveSampleChars = (totalSamples: number): number | null => {
  if (totalSamples <= 0) return null
  const perSample = Math.min(
    TAXONOMY_NAMING_SAMPLE_CHAR_MAX,
    Math.floor((TAXONOMY_NAMING_PROMPT_TOKEN_BUDGET * TAXONOMY_NAMING_CHARS_PER_TOKEN) / totalSamples),
  )
  return perSample < TAXONOMY_NAMING_SAMPLE_CHAR_FLOOR ? null : perSample
}

const TOPIC_POLICY =
  "Conversation topic clusters describe what users come to do (e.g. 'Order Status', 'Returns and Refunds', 'Account Billing'). They are NOT conversational rituals (no 'user greets', 'user thanks', 'user says hello'), NOT model behaviours (no 'agent apologizes'), and NOT generic dispositions ('frustrated user'). If samples disagree, name the dominant topic of the conversation transcripts."

/**
 * The per-tree naming policy: the wording that varies between the topic tree
 * and each facet. Everything else about naming (prompts, collision guard,
 * contrastive sibling-set naming, deepest-first ordering) is shared.
 */
export interface ClusterNamingPolicy {
  /** Domain guidance folded into both naming prompts (was the hard-coded `TOPIC_POLICY`). */
  readonly guidance: string
  /**
   * Naming bans folded into the leaf and interior prompts. Not the root prompt:
   * the root's job IS the project-wide umbrella, which a company-shaped label can
   * legitimately be, and the root is unwrapped before display anyway.
   */
  readonly constraints: string
  /** Upper-cased noun used in "conversation X themes/name" and "umbrella X". */
  readonly subjectLabel: string
  /** Trailing clause after "a one-sentence description". */
  readonly descriptionClause: string
  /** Leaf-mode preamble telling the model what the raw samples are. */
  readonly leafModeContext: string
}

const NO_VERTICAL_CONSTRAINT =
  "NEVER name a cluster after an end customer, brand, company, industry or vertical that appears in the samples — that describes WHOSE account is being worked on, not what the user is doing."
const REQUEST_NOT_REPLY_CONSTRAINT =
  "Name what the user is asking for, never what the assistant produced: never use reply-words (Responses, Replies, Answers, Output, Results, Generation)."

export const TOPIC_NAMING_POLICY: ClusterNamingPolicy = {
  guidance: TOPIC_POLICY,
  constraints: `${NO_VERTICAL_CONSTRAINT} ${REQUEST_NOT_REPLY_CONSTRAINT}`,
  subjectLabel: "TOPIC",
  descriptionClause: "of what the user is trying to do",
  leafModeContext: "These are raw conversation samples. Find the dominant topic across them.",
}

/**
 * Naming policy for a facet: the clusters group one-sentence extracted
 * statements (not raw transcripts), so the model is told to name the shared
 * answer to the facet's question rather than a conversation topic.
 */
export const facetNamingPolicy = (facet: Pick<TaxonomyFacet, "name" | "instructions">): ClusterNamingPolicy => {
  const facetName = facet.name.trim()
  const subject = facetName.toLowerCase()
  return {
    guidance: `Each cluster groups one-sentence statements extracted from separate conversations through the "${facetName}" facet: ${facet.instructions} Name each cluster by the shared ${subject} its statements express, a short label, never the facet name itself, never a conversational ritual or generic disposition. If samples disagree, name the dominant one.`,
    // A facet's own question can legitimately be about what the assistant
    // produced, so only the client/vertical ban carries over from the topic tree.
    constraints: NO_VERTICAL_CONSTRAINT,
    subjectLabel: "THEME",
    descriptionClause: `of the shared ${subject} these statements express`,
    leafModeContext: `These are one-sentence statements extracted from separate conversations through the "${facetName}" facet. Find the dominant ${subject} across them.`,
  }
}

/**
 * Normalize a name so we can detect collisions ("Order Status" vs "order
 * status" vs "Order-Status" should all be treated as the same name).
 */
const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

interface GenerateInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly clusterId: TaxonomyCluster["id"]
  readonly mode: "leaf" | "interior" | "root"
  readonly policy: ClusterNamingPolicy
  readonly samples: readonly string[]
  readonly parentName?: string
  readonly parentDescription?: string
  /** Names this cluster's name MUST NOT match: every named cluster in the tree, family first. */
  readonly forbiddenNames: readonly string[]
  /** Extra "do not pick this exact name" overlay when retrying after a collision. */
  readonly retryForbiddenName?: string
}

const dedupeNames = (names: readonly string[]): readonly string[] => [
  ...new Set(names.filter((name) => name.trim().length > 0)),
]

// The guard checks every name in the tree; the prompt carries the family first
// (the caller orders it that way) and then as many of the rest as fit.
const forbiddenPromptContext = (names: readonly string[], subject: string): string => {
  const forbidden = dedupeNames(names).slice(0, TAXONOMY_NAMING_FORBIDDEN_PROMPT_MAX)
  return forbidden.length > 0
    ? `FORBIDDEN names — ${subject} must not match or paraphrase any of these (they're already used elsewhere in this project's cluster tree):\n${forbidden.map((name) => `- ${name}`).join("\n")}\n\n`
    : ""
}

const generateClusterName = (input: GenerateInput) =>
  withNamingTimeout(
    Effect.gen(function* () {
      const ai = yield* AI
      const sampleLines = input.samples.map((sample, index) => `${index}: ${defangTags(sample)}`).join("\n")
      const parentContext = input.parentName
        ? `These conversations are a sub-topic WITHIN the broader topic "${input.parentName}"${
            input.parentDescription && input.parentDescription.length > 0 ? ` (${input.parentDescription})` : ""
          }. Your name MUST be strictly more specific than "${input.parentName}" — never restate or paraphrase it.\n\n`
        : ""
      const forbiddenContext = forbiddenPromptContext(input.forbiddenNames, 'your "name" field')
      const retryContext = input.retryForbiddenName
        ? `Previous attempt returned "${input.retryForbiddenName}" which is forbidden. Pick a DIFFERENT name.\n\n`
        : ""
      const modeContext =
        input.mode === "root"
          ? "These are NOT raw conversation samples — they are the names and descriptions of the TOP-LEVEL categories in this entire project's taxonomy. Your job is to produce a SHORT umbrella label that captures the WHOLE project. It MUST cover EVERY listed top-level category — never name something that fits one branch but excludes the others. A correct label feels like 'Customer Support Conversations', 'Internal Helpdesk Tickets', or '<Company> Customer Interactions' — broad and category-neutral. The label must not be identical to or paraphrase any listed category."
          : input.mode === "interior"
            ? `These are NOT raw conversation samples — they are the names and descriptions of THIS cluster's CHILD topics. Your job is to find a single short umbrella ${input.policy.subjectLabel} that subsumes all of them and is BROADER than every child. The umbrella must not be identical or near-identical to any child.`
            : input.policy.leafModeContext
      const constraints = input.mode === "root" ? "" : `${input.policy.constraints} `
      const modelConfig = yield* resolveGenerationConfig("TAXONOMY_NAMING", TAXONOMY_DEFAULT_NAMING_MODEL)
      const map = yield* ai.generate({
        ...modelConfig,
        telemetry: {
          spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.taxonomyProposeThemes,
          project: LATITUDE_TELEMETRY_PROJECT_SLUGS.taxonomy,
          tags: [...AI_GENERATE_TELEMETRY_TAGS.taxonomyProposeThemes],
          metadata: buildProjectScopedAiMetadata(
            { organizationId: input.organizationId, projectId: input.projectId },
            { clusterId: input.clusterId, mode: input.mode },
          ),
        },
        system: `proposeCandidateThemes: propose concise candidate conversation ${input.policy.subjectLabel} themes for this cluster. ${input.policy.guidance} ${constraints}${modeContext} Return only schema-valid JSON.`,
        prompt: `${parentContext}${forbiddenContext}${retryContext}Samples:\n${sampleLines}`,
        schema: candidateThemesSchema,
      })
      const reduced = yield* ai.generate({
        ...modelConfig,
        telemetry: {
          spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.taxonomyNameCluster,
          project: LATITUDE_TELEMETRY_PROJECT_SLUGS.taxonomy,
          tags: [...AI_GENERATE_TELEMETRY_TAGS.taxonomyNameCluster],
          metadata: buildProjectScopedAiMetadata(
            { organizationId: input.organizationId, projectId: input.projectId },
            { clusterId: input.clusterId, mode: input.mode },
          ),
        },
        system: `Collapse candidate themes into ONE conversation ${input.policy.subjectLabel} name (2-5 words) and a one-sentence description ${input.policy.descriptionClause}. ${input.policy.guidance} ${constraints}${modeContext} The name MUST be clearly distinct from any forbidden names provided. Return only schema-valid JSON with BOTH required string keys: name and description.`,
        prompt: `${parentContext}${forbiddenContext}${retryContext}Samples:\n${sampleLines}\n\nCandidates:\n${JSON.stringify(map.object.candidates)}\n\nReturn JSON exactly like {"name":"Short topic label","description":"One sentence describing what these conversations are about."}`,
        schema: finalNameSchema,
      })
      return reduced.object
    }),
  )

const readableObservationSummary = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed
}

const generateWithCollisionGuard = (input: Omit<GenerateInput, "retryForbiddenName">) =>
  Effect.gen(function* () {
    const forbiddenNormalized = new Set(input.forbiddenNames.map(normalizeName).filter((n) => n.length > 0))
    const firstAttempt = yield* generateClusterName(input)
    if (!forbiddenNormalized.has(normalizeName(firstAttempt.name))) {
      return firstAttempt
    }
    // Retry once with the offending name surfaced explicitly.
    const retry = yield* generateClusterName({ ...input, retryForbiddenName: firstAttempt.name })
    if (!forbiddenNormalized.has(normalizeName(retry.name))) {
      return retry
    }
    // Last-resort fallback: keep the LLM's second attempt but suffix it so
    // the tree still shows distinct names. We never silently overwrite with
    // a forbidden value because that breaks the assertTaxonomyQuality
    // duplicate-name gate.
    return {
      name: `${retry.name} (subtopic)`,
      description: retry.description,
    }
  })

interface ContrastiveMemberInput {
  readonly clusterId: TaxonomyCluster["id"]
  readonly samples: readonly string[]
}

interface ContrastiveGenerateInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** The cluster whose naming pass is driving the set; used for telemetry only. */
  readonly clusterId: TaxonomyCluster["id"]
  readonly policy: ClusterNamingPolicy
  readonly members: readonly ContrastiveMemberInput[]
  readonly parentName?: string
  readonly parentDescription?: string
  readonly forbiddenNames: readonly string[]
  /** Names the previous attempt returned that were duplicated or forbidden. */
  readonly retryRejectedNames?: readonly string[]
}

interface ContrastiveClusterName {
  readonly clusterId: TaxonomyCluster["id"]
  readonly name: string
  readonly description: string
}

/**
 * Names a whole sibling set in one map/reduce pair, asking what SEPARATES the
 * siblings instead of asking each one for its dominant topic in isolation. Where
 * every session shares a domain, "the dominant topic" is constant, so naming in
 * isolation collapses onto the same few domain words by construction.
 */
const generateContrastiveNames = (input: ContrastiveGenerateInput) =>
  withNamingTimeout(
    Effect.gen(function* () {
      const ai = yield* AI
      const count = input.members.length
      const clusterBlocks = input.members
        .map(
          (member, index) =>
            `CLUSTER ${index}:\n${member.samples
              .map((sample, sampleIndex) => `  ${sampleIndex}: ${defangTags(sample)}`)
              .join("\n")}`,
        )
        .join("\n\n")
      const parentContext = input.parentName
        ? `All ${count} clusters are sub-topics WITHIN the broader topic "${input.parentName}"${
            input.parentDescription && input.parentDescription.length > 0 ? ` (${input.parentDescription})` : ""
          }. Every name MUST be strictly more specific than "${input.parentName}" — never restate or paraphrase it.\n\n`
        : ""
      const forbiddenContext = forbiddenPromptContext(input.forbiddenNames, "the names you return")
      const retryContext =
        input.retryRejectedNames && input.retryRejectedNames.length > 0
          ? `Previous attempt returned ${input.retryRejectedNames.map((name) => `"${name}"`).join(", ")}, which duplicate each other or a forbidden name. Return DIFFERENT, mutually distinct names.\n\n`
          : ""
      const contrastContext = `These are ${count} SIBLING clusters from the same project, each with its own conversation samples. They all share the project's domain, so any theme that is true of every cluster is USELESS as a name — it is what SEPARATES one cluster from the others that names it.`
      const modelConfig = yield* resolveGenerationConfig("TAXONOMY_NAMING", TAXONOMY_DEFAULT_NAMING_MODEL)
      const jointConfig = {
        ...modelConfig,
        maxTokens: Math.max(modelConfig.maxTokens ?? 0, TAXONOMY_CONTRASTIVE_NAMING_MAX_TOKENS),
      }
      const telemetryMetadata = buildProjectScopedAiMetadata(
        { organizationId: input.organizationId, projectId: input.projectId },
        { clusterId: input.clusterId, mode: "contrastive", siblingCount: count },
      )
      const map = yield* ai.generate({
        ...jointConfig,
        telemetry: {
          spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.taxonomyProposeThemes,
          project: LATITUDE_TELEMETRY_PROJECT_SLUGS.taxonomy,
          tags: [...AI_GENERATE_TELEMETRY_TAGS.taxonomyProposeThemes],
          metadata: telemetryMetadata,
        },
        system: `proposeContrastiveThemes: for each of these sibling clusters, propose what DISTINGUISHES it from its siblings. ${input.policy.guidance} ${input.policy.constraints} ${input.policy.leafModeContext} ${contrastContext} Return one entry per cluster index, with its differentiators. Return only schema-valid JSON.`,
        prompt: `${parentContext}${forbiddenContext}${retryContext}${clusterBlocks}`,
        schema: contrastiveThemesSchema,
      })
      const reduced = yield* ai.generate({
        ...jointConfig,
        telemetry: {
          spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.taxonomyNameCluster,
          project: LATITUDE_TELEMETRY_PROJECT_SLUGS.taxonomy,
          tags: [...AI_GENERATE_TELEMETRY_TAGS.taxonomyNameCluster],
          metadata: telemetryMetadata,
        },
        system: `Name all ${count} sibling clusters in one pass: for each, ONE conversation ${input.policy.subjectLabel} name (2-5 words) and a one-sentence description ${input.policy.descriptionClause}. ${input.policy.guidance} ${input.policy.constraints} ${input.policy.leafModeContext} ${contrastContext} Each name MUST name what is specific to that cluster — never a label that would fit a sibling equally well — and the names MUST be mutually distinct and clearly distinct from any forbidden names provided. Return one entry per cluster index, only schema-valid JSON.`,
        prompt: `${parentContext}${forbiddenContext}${retryContext}${clusterBlocks}\n\nDifferentiators:\n${JSON.stringify(map.object.clusters)}\n\nReturn JSON exactly like {"clusters":[{"index":0,"name":"Short topic label","description":"One sentence describing what these conversations are about."}]}`,
        schema: contrastiveNamesSchema,
      })
      return reduced.object.clusters
    }),
    TAXONOMY_CONTRASTIVE_NAMING_TIMEOUT_MS,
  )

/**
 * Resolves one contrastive attempt into a name per cluster. `rejected` names
 * collide with each other or with the tree and are worth one retry; `incomplete`
 * means the model left a cluster out, which a retry cannot be told to fix, so the
 * caller falls straight back to per-child naming.
 */
const resolveContrastiveNames = (
  input: ContrastiveGenerateInput,
  returned: readonly { readonly index: number; readonly name: string; readonly description: string }[],
):
  | { readonly names: readonly ContrastiveClusterName[] }
  | { readonly rejected: readonly string[] }
  | { readonly incomplete: true } => {
  const forbiddenNormalized = new Set(input.forbiddenNames.map(normalizeName).filter((name) => name.length > 0))
  const taken = new Set<string>()
  const rejected: string[] = []
  const names: ContrastiveClusterName[] = []
  for (const [index, member] of input.members.entries()) {
    const match = returned.find((entry) => entry.index === index)
    if (match === undefined) return { incomplete: true }
    const normalized = normalizeName(match.name)
    if (normalized.length === 0 || forbiddenNormalized.has(normalized) || taken.has(normalized)) {
      rejected.push(match.name)
      continue
    }
    taken.add(normalized)
    names.push({ clusterId: member.clusterId, name: match.name, description: match.description })
  }
  return rejected.length > 0 ? { rejected } : { names }
}

const generateContrastiveWithGuard = (input: ContrastiveGenerateInput) =>
  Effect.gen(function* () {
    const first = resolveContrastiveNames(input, yield* generateContrastiveNames(input))
    if ("names" in first) return first.names
    if ("incomplete" in first) return null
    const retry = resolveContrastiveNames(
      input,
      yield* generateContrastiveNames({ ...input, retryRejectedNames: first.rejected }),
    )
    return "names" in retry ? retry.names : null
  })

/**
 * The view a cluster is named within. Every tree (global topic, cohort topic,
 * and each facet) shares the same prompts, collision guard, and
 * deepest-first ordering and differs only here: which sub-tree the
 * siblings/children come from (`customBehaviorId` × `facetId`), where the member
 * embeddings/summaries are read from (`listMembers`), and the wording `policy`.
 * `nameClusterCore` owns everything else.
 */
interface ClusterNamingSource {
  /** Omit/null for whole-project scope; set to scope the cluster tree to a cohort. */
  readonly customBehaviorId?: CustomBehaviorId | null
  /** Omit/null for the topic tree; set to scope the cluster tree to a facet. */
  readonly facetId?: FacetId | null
  /** Per-tree naming wording. Defaults to `TOPIC_NAMING_POLICY`. */
  readonly policy?: ClusterNamingPolicy
  readonly listMembers: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly clusterId: TaxonomyCluster["id"]
    readonly limit: number
  }) => Effect.Effect<readonly TaxonomyClusterNamingMember[], RepositoryError, ChSqlClient>
  /**
   * Members by explicit observation id, used when `NameClusterInput` carries the
   * staged plan's member ids. Absent ⇒ that tree is always named after its
   * assignments land, so `listMembers` is the only source.
   */
  readonly listMembersByIds?: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly observationIds: readonly string[]
    readonly limit: number
  }) => Effect.Effect<readonly TaxonomyClusterNamingMember[], RepositoryError, ChSqlClient>
}

interface NamingContext {
  readonly cluster: TaxonomyCluster
  readonly parent: TaxonomyCluster | null
  readonly siblings: readonly TaxonomyCluster[]
  /** Same-parent siblings still waiting to be named — the candidates for one contrastive call. */
  readonly unnamedSiblings: readonly TaxonomyCluster[]
  readonly children: readonly TaxonomyCluster[]
  /** Every other named cluster in this tree, whatever its branch. */
  readonly treeNames: readonly string[]
}

interface MemberSummary {
  readonly embedding: readonly number[]
  readonly summary: string
}

const hasName = (cluster: TaxonomyCluster | null): cluster is TaxonomyCluster =>
  cluster !== null && cluster.name !== TAXONOMY_PENDING_DISPLAY_NAME

const loadNamingContext = (input: NameClusterInput, source: ClusterNamingSource) =>
  Effect.gen(function* () {
    const clusters = yield* TaxonomyClusterRepository
    const cluster = yield* clusters.findById(input.clusterId)
    const parent =
      cluster.parentClusterId === null
        ? null
        : yield* clusters.findById(cluster.parentClusterId).pipe(Effect.orElseSucceed(() => null))
    const scope = {
      ...(source.customBehaviorId ? { customBehaviorId: source.customBehaviorId } : {}),
      ...(source.facetId ? { facetId: source.facetId } : {}),
    }
    // A staged tree is named before the swap activates it, so the family lookups
    // must span both states — a staging node's parent/siblings/children are
    // staging too, and only a reused-id continuation is already active.
    const states = ["active", "staging"] as const
    const family = yield* clusters.listActiveByProject({
      projectId: input.projectId,
      dimension: cluster.dimension,
      parentClusterId: cluster.parentClusterId,
      states,
      ...scope,
    })
    const siblingCandidates = family.filter((candidate) => candidate.id !== cluster.id)
    const siblings = siblingCandidates.filter(hasName)
    const unnamedSiblings = [
      ...siblingCandidates.filter((candidate) => candidate.name === TAXONOMY_PENDING_DISPLAY_NAME),
    ].sort((a, b) => a.id.localeCompare(b.id))
    const children = (yield* clusters.listActiveByProject({
      projectId: input.projectId,
      dimension: cluster.dimension,
      parentClusterId: cluster.id,
      states,
      ...scope,
    })).filter((child) => hasName(child) && child.description.trim().length > 0)
    // Tree-wide, not just the family: two leaves under different parents shipped
    // identical names while the guard only compared parent/siblings/children.
    // Own state only, unlike the family lookups: while a staged tree is being named
    // the tree it will replace is still `active`, and forbidding its names would
    // churn every label that legitimately survives a rebuild.
    const tree = yield* clusters.listActiveByProject({
      projectId: input.projectId,
      dimension: cluster.dimension,
      states: [cluster.state],
      ...scope,
    })
    const familyIds = new Set([
      ...(parent ? [parent.id as string] : []),
      ...siblings.map((sibling) => sibling.id as string),
      ...children.map((child) => child.id as string),
    ])
    const others = tree.filter((node) => node.id !== cluster.id && hasName(node) && !familyIds.has(node.id))
    return {
      cluster,
      parent,
      siblings,
      unnamedSiblings,
      children,
      treeNames: [
        ...(hasName(parent) ? [parent.name] : []),
        ...siblings.map((sibling) => sibling.name),
        ...children.map((child) => child.name),
        ...others.map((node) => node.name),
      ],
    } satisfies NamingContext
  })

const loadMemberSummaries = (
  input: NameClusterInput,
  source: ClusterNamingSource,
  clusterId: TaxonomyCluster["id"] = input.clusterId,
) =>
  Effect.gen(function* () {
    const stagedMemberIds =
      clusterId === input.clusterId
        ? (input.memberObservationIds ?? [])
        : (input.memberObservationIdsByClusterId?.[clusterId] ?? [])
    const rows =
      stagedMemberIds.length > 0 && source.listMembersByIds !== undefined
        ? yield* source.listMembersByIds({
            organizationId: input.organizationId,
            projectId: input.projectId,
            observationIds: stagedMemberIds,
            limit: TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
          })
        : yield* source.listMembers({
            organizationId: input.organizationId,
            projectId: input.projectId,
            clusterId,
            limit: TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
          })
    const ranked = [...rows].sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    return ranked.flatMap((row) => {
      const summary = readableObservationSummary(row.projectionMetadata.summary)
      return summary === null ? [] : [{ embedding: row.embedding, summary } satisfies MemberSummary]
    })
  })

/**
 * A staged sibling has no ClickHouse membership yet, so it can only be sampled
 * from the naming plan's member ids. Without them the set cannot be assembled and
 * naming stays per child.
 */
const canSampleSibling = (input: NameClusterInput, source: ClusterNamingSource, clusterId: string): boolean => {
  const staged = (input.memberObservationIds ?? []).length > 0 && source.listMembersByIds !== undefined
  return !staged || (input.memberObservationIdsByClusterId?.[clusterId]?.length ?? 0) > 0
}

const selectSamples = (members: readonly MemberSummary[], count: number): readonly string[] => {
  const selected = farthestPointSample(
    members.map((row) => row.embedding),
    count,
  )
  return selected.flatMap((index) => {
    const row = members[index]
    return row === undefined ? [] : [row.summary]
  })
}

const parentContext = (parent: TaxonomyCluster | null) => ({
  ...(hasName(parent) ? { parentName: parent.name } : {}),
  ...(parent && parent.description.trim().length > 0 ? { parentDescription: parent.description } : {}),
})

const generateName = (
  input: NameClusterInput,
  context: NamingContext,
  members: readonly MemberSummary[],
  policy: ClusterNamingPolicy,
) =>
  Effect.gen(function* () {
    const { cluster, parent, children } = context
    const shared = {
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterId: input.clusterId,
      policy,
      forbiddenNames: context.treeNames,
      ...parentContext(parent),
    }

    if (members.length > 0) {
      // Leaf path (or interior with residue): name from direct member text.
      return yield* generateWithCollisionGuard({
        ...shared,
        mode: "leaf",
        samples: selectSamples(members, sampleBudget(cluster.observationCount)),
      })
    }

    if (children.length > 0) {
      // Interior path: collapse already-named children into a broader umbrella.
      // Naming is run deepest-first by the workflow so children are stable.
      // The root cluster (no parent) uses a different mode because the LLM
      // tends to pick a name that fits its biggest child instead of a true
      // project-wide superset when run through the regular "interior" prompt.
      return yield* generateWithCollisionGuard({
        ...shared,
        mode: parent === null ? "root" : "interior",
        samples: children
          .slice(0, sampleBudget(children.reduce((sum, child) => sum + child.observationCount, 0)))
          .map((child) => `${child.name}: ${child.description}`),
      })
    }

    // No members, no named children — leave Pending so a later pass can try
    // again once children are named.
    return null
  })

const contrastiveCacheKey = (input: {
  readonly organizationId: OrganizationId
  readonly namingPassId: string
  readonly parentClusterId: string
  readonly clusterId: string
}): string =>
  `org:${input.organizationId}:taxonomy:naming:contrastive:${input.namingPassId}:${input.parentClusterId}:${input.clusterId}`

const contrastiveCacheSchema = z.object({ name: z.string().min(1), description: z.string() })

const parseContrastiveCacheValue = (value: string): NameTaxonomyResult | null => {
  try {
    const parsed = contrastiveCacheSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * The name a sibling's contrastive call already produced for this cluster in this
 * pass. Read once and deleted, and keyed by pass on top of that: continuations
 * reuse cluster ids across rebuilds, so an entry must never reach a second pass.
 */
const readContrastiveName = (input: NameClusterInput, context: NamingContext) =>
  Effect.gen(function* () {
    const parentClusterId = context.cluster.parentClusterId
    const namingPassId = input.namingPassId
    if (parentClusterId === null || namingPassId === undefined) return null
    const cacheOption = yield* Effect.serviceOption(CacheStore)
    if (Option.isNone(cacheOption)) return null
    const key = contrastiveCacheKey({
      organizationId: input.organizationId,
      namingPassId,
      parentClusterId,
      clusterId: input.clusterId,
    })
    const cached = yield* cacheOption.value.get(key).pipe(Effect.catchTag("CacheError", () => Effect.succeed(null)))
    if (cached === null) return null
    yield* cacheOption.value.delete(key).pipe(Effect.catchTag("CacheError", () => Effect.void))
    const parsed = parseContrastiveCacheValue(cached)
    if (parsed === null) return null
    const taken = new Set(context.treeNames.map(normalizeName))
    return taken.has(normalizeName(parsed.name)) ? null : parsed
  })

const writeContrastiveNames = (
  input: NameClusterInput,
  namingPassId: string,
  parentClusterId: string,
  names: readonly ContrastiveClusterName[],
) =>
  Effect.gen(function* () {
    const cacheOption = yield* Effect.serviceOption(CacheStore)
    if (Option.isNone(cacheOption)) return
    for (const entry of names) {
      if (entry.clusterId === input.clusterId) continue
      yield* cacheOption.value
        .set(
          contrastiveCacheKey({
            organizationId: input.organizationId,
            namingPassId,
            parentClusterId,
            clusterId: entry.clusterId,
          }),
          JSON.stringify({ name: entry.name, description: entry.description }),
          { ttlSeconds: TAXONOMY_CONTRASTIVE_NAMING_CACHE_TTL_SECONDS },
        )
        .pipe(Effect.catchTag("CacheError", () => Effect.void))
    }
  })

/**
 * Names this cluster together with every sibling still waiting for a name, in one
 * map/reduce pair, and leaves the siblings' names in the cache for their own
 * naming passes to pick up — so the set costs fewer model calls than naming each
 * sibling on its own. Returns `null` when the set cannot be assembled or cannot be
 * shown within the per-call budget; the caller then names this cluster alone.
 */
const nameContrastiveSet = (
  input: NameClusterInput,
  source: ClusterNamingSource,
  context: NamingContext,
  members: readonly MemberSummary[],
  policy: ClusterNamingPolicy,
) =>
  Effect.gen(function* () {
    const parentClusterId = context.cluster.parentClusterId
    const namingPassId = input.namingPassId
    if (parentClusterId === null || namingPassId === undefined || context.unnamedSiblings.length === 0) return null
    // Without a cache there is nowhere to leave the siblings' names, so a joint
    // call would be repeated for every sibling instead of replacing their calls.
    if (Option.isNone(yield* Effect.serviceOption(CacheStore))) return null
    const candidates: ContrastiveMemberInput[] = [
      {
        clusterId: context.cluster.id,
        samples: selectSamples(members, sampleBudget(context.cluster.observationCount)),
      },
    ]
    for (const sibling of context.unnamedSiblings) {
      if (!canSampleSibling(input, source, sibling.id)) continue
      // Reduced to its samples before the next sibling loads, so the set holds one
      // cluster's embeddings at a time rather than the whole parent's.
      const siblingMembers = yield* loadMemberSummaries(input, source, sibling.id)
      if (siblingMembers.length === 0) continue
      candidates.push({
        clusterId: sibling.id,
        samples: selectSamples(siblingMembers, sampleBudget(sibling.observationCount)),
      })
    }
    if (candidates.length < 2) return null
    const perSampleChars = contrastiveSampleChars(
      candidates.reduce((total, candidate) => total + candidate.samples.length, 0),
    )
    if (perSampleChars === null) return null
    // A timeout, provider error or short response degrades to per-child naming
    // rather than leaving the cluster Pending; a systemic failure resurfaces there.
    const generated = yield* generateContrastiveWithGuard({
      organizationId: input.organizationId,
      projectId: input.projectId,
      clusterId: input.clusterId,
      policy,
      members: candidates.map((candidate) => ({
        clusterId: candidate.clusterId,
        samples: candidate.samples.map((sample) => truncateSample(sample, perSampleChars)),
      })),
      forbiddenNames: context.treeNames,
      ...parentContext(context.parent),
    }).pipe(Effect.orElseSucceed(() => null))
    if (generated === null) return null
    const own = generated.find((entry) => entry.clusterId === input.clusterId)
    if (own === undefined) return null
    yield* writeContrastiveNames(input, namingPassId, parentClusterId, generated)
    yield* Effect.annotateCurrentSpan("taxonomy.naming.contrastiveSetSize", candidates.length)
    return { name: own.name, description: own.description } satisfies NameTaxonomyResult
  })

const persistName = (input: NameClusterInput, generated: NameTaxonomyResult, now: Date) =>
  // Save under the cluster lock against a fresh read: the LLM call above takes
  // seconds, during which live online assignment mutates centroid/counters on
  // the same row. A stale full-row upsert would clobber them.
  withTaxonomyClusterLock(
    {
      organizationId: input.organizationId,
      clusterId: input.clusterId,
      ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
    },
    Effect.gen(function* () {
      const clusters = yield* TaxonomyClusterRepository
      const fresh = yield* clusters.findById(input.clusterId)
      yield* clusters.save({
        ...fresh,
        name: generated.name,
        description: generated.description,
        clusteredAt: now,
        updatedAt: now,
      })
    }),
  )

export const nameClusterCore = (input: NameClusterInput, source: ClusterNamingSource) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    if (source.customBehaviorId) {
      yield* Effect.annotateCurrentSpan("taxonomy.customBehaviorId", source.customBehaviorId)
    }
    if (source.facetId) {
      yield* Effect.annotateCurrentSpan("taxonomy.facetId", source.facetId)
    }
    yield* Effect.annotateCurrentSpan("taxonomy.clusterId", input.clusterId)
    const now = input.now ?? new Date()
    const policy = source.policy ?? TOPIC_NAMING_POLICY

    const context = yield* loadNamingContext(input, source)
    const fromSiblingSet = yield* readContrastiveName(input, context)
    if (fromSiblingSet !== null) {
      yield* persistName(input, fromSiblingSet, now)
      return fromSiblingSet satisfies NameTaxonomyResult
    }

    const members = yield* loadMemberSummaries(input, source)
    const contrastive = members.length > 0 ? yield* nameContrastiveSet(input, source, context, members, policy) : null
    const generated = contrastive !== null ? contrastive : yield* generateName(input, context, members, policy)
    if (generated === null) {
      return {
        name: context.cluster.name,
        description: context.cluster.description,
      } satisfies NameTaxonomyResult
    }

    yield* persistName(input, generated, now)
    return generated satisfies NameTaxonomyResult
  })

export const nameClusterUseCase = (input: NameClusterInput) =>
  Effect.gen(function* () {
    const observations = yield* TaxonomyObservationRepository
    return yield* nameClusterCore(input, {
      listMembers: (params) => observations.listAllByCluster(params),
      listMembersByIds: (params) => observations.listAllByObservationIds(params),
    })
  }).pipe(Effect.withSpan("taxonomy.nameCluster"))
