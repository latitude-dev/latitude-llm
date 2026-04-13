import {
  SEED_ACCESS_EVALUATION_HASH,
  SEED_ACCESS_EVALUATION_ID,
  SEED_ACCESS_ISSUE_ID,
  SEED_ACCESS_ISSUE_UUID,
  SEED_BILLING_ISSUE_ID,
  SEED_BILLING_ISSUE_UUID,
  SEED_COMBINATION_EVALUATION_HASH,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_COMBINATION_ISSUE_ID,
  SEED_COMBINATION_ISSUE_UUID,
  SEED_EVALUATION_ID,
  SEED_EXTRA_ISSUE_IDS,
  SEED_EXTRA_ISSUE_UUIDS,
  SEED_GENERATE_ISSUE_ID,
  SEED_GENERATE_ISSUE_UUID,
  SEED_INSTALLATION_ISSUE_ID,
  SEED_INSTALLATION_ISSUE_UUID,
  SEED_ISSUE_ID,
  SEED_ISSUE_UUID,
  SEED_RETURNS_EVALUATION_HASH,
  SEED_RETURNS_EVALUATION_ID,
  SEED_RETURNS_ISSUE_ID,
  SEED_RETURNS_ISSUE_UUID,
  SEED_TIMELINE_WINDOW_DAYS,
  SEED_WARRANTY_ARCHIVED_EVALUATION_HASH,
  SEED_WARRANTY_EVALUATION_HASH,
} from "../seeds.ts"

export type SeedIssueFixture = {
  readonly id: string
  readonly uuid: string
  readonly name: string
  readonly description: string
  readonly createdDaysAgo: number
  readonly clusteredDaysAgo: number
  readonly updatedDaysAgo: number
  readonly escalatedDaysAgo: number | null
  readonly resolvedDaysAgo: number | null
  readonly ignoredDaysAgo: number | null
}

const baseIssueFixtures = [
  {
    id: SEED_ISSUE_ID,
    uuid: SEED_ISSUE_UUID,
    name: "Agent promises warranty coverage for excluded incidents",
    description:
      "The support agent tells customers that misuse incidents are covered by warranty when Acme policy " +
      "explicitly excludes cliffs, mesas, rooftop use, canyon anchoring, and other unsupported terrain or " +
      "installation conditions. The model may invent loyalty waivers, promise reimbursement before review, " +
      "or reframe misuse as a covered manufacturing defect.",
    createdDaysAgo: 82,
    clusteredDaysAgo: 0,
    updatedDaysAgo: 0,
    escalatedDaysAgo: 0,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    id: SEED_COMBINATION_ISSUE_ID,
    uuid: SEED_COMBINATION_ISSUE_UUID,
    name: "Agent recommends dangerous product combinations",
    description:
      "The support agent suggests combining Acme products in ways that compound danger, such as pairing " +
      "propulsion products, spatial distortion tools, weather controls, or seismic products. The model often " +
      "ignores documented incident history, invents authorization exceptions, or treats uncertified bundles as safe.",
    createdDaysAgo: 71,
    clusteredDaysAgo: 0,
    updatedDaysAgo: 0,
    escalatedDaysAgo: 0,
    resolvedDaysAgo: 8,
    ignoredDaysAgo: null,
  },
  {
    id: SEED_GENERATE_ISSUE_ID,
    uuid: SEED_GENERATE_ISSUE_UUID,
    name: "Agent invents unsupported logistics guarantees",
    description:
      "The support agent fabricates shipping promises, fee waivers, warehouse pickup options, or specialty " +
      "delivery services that Acme does not actually provide. The behavior is especially risky around cliffside " +
      "destinations, hazardous goods, and interplanetary shipping requests where the model turns review-only paths " +
      "into guaranteed service commitments.",
    createdDaysAgo: 4,
    clusteredDaysAgo: 0,
    updatedDaysAgo: 0,
    escalatedDaysAgo: 0,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    id: SEED_RETURNS_ISSUE_ID,
    uuid: SEED_RETURNS_ISSUE_UUID,
    name: "Agent overstates instant returns eligibility",
    description:
      "The support agent promises immediate refunds, free pickup, or no-questions-asked replacements for orders " +
      "that still require inspection, are outside the return window, or carry restocking requirements. The pattern " +
      "usually appears when customers insist on urgent refunds for partially used or damaged products.",
    createdDaysAgo: 58,
    clusteredDaysAgo: 2,
    updatedDaysAgo: 2,
    escalatedDaysAgo: 45,
    resolvedDaysAgo: 9,
    ignoredDaysAgo: null,
  },
  {
    id: SEED_BILLING_ISSUE_ID,
    uuid: SEED_BILLING_ISSUE_UUID,
    name: "Agent invents courtesy credits and retroactive fee waivers",
    description:
      "The support agent offers courtesy credits, loyalty refunds, or retroactive surcharge reversals that are not " +
      "documented in Acme billing policy. The issue is noisy because some customers mention real discounts, but the " +
      "failure pattern is the model confidently minting credits or waivers without approval or an existing case note.",
    createdDaysAgo: 46,
    clusteredDaysAgo: 10,
    updatedDaysAgo: 9,
    escalatedDaysAgo: 18,
    resolvedDaysAgo: null,
    ignoredDaysAgo: 9,
  },
  {
    id: SEED_ACCESS_ISSUE_ID,
    uuid: SEED_ACCESS_ISSUE_UUID,
    name: "Agent bypasses account recovery verification",
    description:
      "The support agent skips identity checks during account recovery by accepting weak proof, disabling MFA on " +
      "request, exposing partial account data before verification, or issuing recovery guidance that should only be " +
      "available after approved ownership checks.",
    createdDaysAgo: 34,
    clusteredDaysAgo: 0,
    updatedDaysAgo: 0,
    escalatedDaysAgo: 0,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    id: SEED_INSTALLATION_ISSUE_ID,
    uuid: SEED_INSTALLATION_ISSUE_UUID,
    name: "Agent fabricates on-site installation certifications",
    description:
      "The support agent tells customers that Acme can provide certified on-site installation, field sign-off, or " +
      "compliance inspection paperwork for products that are shipped self-service only. The hallucination often mixes " +
      "real reseller setup programs with nonexistent Acme-operated installation teams.",
    createdDaysAgo: 83,
    clusteredDaysAgo: 2,
    updatedDaysAgo: 2,
    escalatedDaysAgo: null,
    resolvedDaysAgo: 7,
    ignoredDaysAgo: null,
  },
]

const curatedExtraIssueBlueprints = [
  {
    name: "Agent invents enterprise SLAs for standard support plans",
    description:
      "The support agent promises named SLAs, priority response guarantees, or dedicated support channels for customers on standard plans. The issue appears when the model upgrades ordinary customers into enterprise-style contracts that do not exist.",
    createdDaysAgo: 86,
    clusteredDaysAgo: 61,
    updatedDaysAgo: 61,
    escalatedDaysAgo: 70,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent fabricates export-control clearances",
    description:
      "The support agent claims export approval, customs pre-clearance, or restricted-destination eligibility for orders that still require legal review. It often invents reference numbers or says the shipment is already cleared.",
    createdDaysAgo: 79,
    clusteredDaysAgo: 52,
    updatedDaysAgo: 52,
    escalatedDaysAgo: null,
    resolvedDaysAgo: 45,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent guarantees chargeback reversals",
    description:
      "The support agent promises that finance will reverse chargebacks or bank disputes automatically after the customer explains the situation, without waiting for payment operations review or issuer confirmation.",
    createdDaysAgo: 76,
    clusteredDaysAgo: 37,
    updatedDaysAgo: 37,
    escalatedDaysAgo: 54,
    resolvedDaysAgo: null,
    ignoredDaysAgo: 22,
  },
  {
    name: "Agent invents procurement onboarding approvals",
    description:
      "The support agent tells buyers that vendor onboarding, procurement registration, or approved-supplier status is already complete when the procurement team has not yet approved the account.",
    createdDaysAgo: 73,
    clusteredDaysAgo: 28,
    updatedDaysAgo: 28,
    escalatedDaysAgo: 49,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent overcommits recall reimbursement scope",
    description:
      "The support agent says recall reimbursements will include shipping, labor, or incidental damages that are not covered by the documented recall campaign. The issue tends to appear in urgent safety conversations.",
    createdDaysAgo: 69,
    clusteredDaysAgo: 18,
    updatedDaysAgo: 18,
    escalatedDaysAgo: 41,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent invents reseller discount ladders",
    description:
      "The support agent quotes volume or reseller discount tiers that have not been approved for the account. It frequently fabricates threshold names, loyalty tiers, or stackable margin protections.",
    createdDaysAgo: 64,
    clusteredDaysAgo: 15,
    updatedDaysAgo: 15,
    escalatedDaysAgo: null,
    resolvedDaysAgo: 30,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent promises warehouse stock reservations without hold confirmation",
    description:
      "The support agent tells customers inventory has been reserved, placed on hold, or ring-fenced for pickup before warehouse systems or operations staff confirm the reservation.",
    createdDaysAgo: 60,
    clusteredDaysAgo: 10,
    updatedDaysAgo: 10,
    escalatedDaysAgo: 32,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent fabricates multilingual legal review sign-off",
    description:
      "The support agent claims translated contracts, warranty terms, or product disclaimers were legally reviewed in a target language when only the source-language policy exists.",
    createdDaysAgo: 57,
    clusteredDaysAgo: 40,
    updatedDaysAgo: 40,
    escalatedDaysAgo: null,
    resolvedDaysAgo: null,
    ignoredDaysAgo: 11,
  },
  {
    name: "Agent invents partner-managed installation crews",
    description:
      "The support agent says approved partner technicians, field installers, or managed setup crews are automatically available in regions where Acme only ships self-service products.",
    createdDaysAgo: 54,
    clusteredDaysAgo: 26,
    updatedDaysAgo: 26,
    escalatedDaysAgo: 29,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent overstates certification renewal status",
    description:
      "The support agent tells customers that certifications, compliance renewals, or permit extensions are current even when the renewal is still pending or in review.",
    createdDaysAgo: 51,
    clusteredDaysAgo: 7,
    updatedDaysAgo: 7,
    escalatedDaysAgo: 24,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent fabricates incident root-cause determinations",
    description:
      "The support agent states that engineering already confirmed a root cause, failure mode, or defect category before the official incident review is finished.",
    createdDaysAgo: 47,
    clusteredDaysAgo: 16,
    updatedDaysAgo: 16,
    escalatedDaysAgo: null,
    resolvedDaysAgo: 14,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent promises automatic contract renewals with frozen pricing",
    description:
      "The support agent guarantees renewals, frozen price protection, or auto-extension terms for accounts whose contracts still require sales approval or updated pricing review.",
    createdDaysAgo: 43,
    clusteredDaysAgo: 9,
    updatedDaysAgo: 9,
    escalatedDaysAgo: 15,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent invents hazardous-goods packaging exemptions",
    description:
      "The support agent says special packaging rules do not apply because the order qualifies for a waiver, alternate handling class, or internal exemption that does not exist.",
    createdDaysAgo: 39,
    clusteredDaysAgo: 12,
    updatedDaysAgo: 12,
    escalatedDaysAgo: 18,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent overcommits loyalty-tier case escalation rights",
    description:
      "The support agent tells customers their loyalty tier entitles them to executive review, emergency escalation, or expedited refunds that are not actually included in the program.",
    createdDaysAgo: 35,
    clusteredDaysAgo: 5,
    updatedDaysAgo: 5,
    escalatedDaysAgo: 12,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent invents data-retention deletions already completed",
    description:
      "The support agent states that conversation logs, support files, or account data have already been deleted even though the retention or privacy workflow is still pending.",
    createdDaysAgo: 31,
    clusteredDaysAgo: 20,
    updatedDaysAgo: 20,
    escalatedDaysAgo: null,
    resolvedDaysAgo: null,
    ignoredDaysAgo: 7,
  },
  {
    name: "Agent promises API quota boosts without capacity approval",
    description:
      "The support agent tells developers that their quota has already been raised, burst limits were approved, or rate limiting will be waived before platform operations confirms capacity.",
    createdDaysAgo: 27,
    clusteredDaysAgo: 6,
    updatedDaysAgo: 6,
    escalatedDaysAgo: 8,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent fabricates offline service windows",
    description:
      "The support agent commits to maintenance windows, offline service appointments, or scheduled downtime protections that were never booked with operations.",
    createdDaysAgo: 24,
    clusteredDaysAgo: 17,
    updatedDaysAgo: 17,
    escalatedDaysAgo: null,
    resolvedDaysAgo: 6,
    ignoredDaysAgo: null,
  },
  {
    name: "Agent invents customer-specific insurance riders",
    description:
      "The support agent says the customer has an insurance rider, special loss protection, or premium incident coverage that was never purchased or approved.",
    createdDaysAgo: 19,
    clusteredDaysAgo: 3,
    updatedDaysAgo: 3,
    escalatedDaysAgo: 5,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  },
] as const

const generatedIssueDomains = [
  {
    titlePrefix: "billing",
    label: "billing workflows",
    reviewTeam: "finance operations",
    workflow: "billing adjustment review",
    failurePattern: "quotes account-specific credits or reversals as already approved",
  },
  {
    titlePrefix: "export-control",
    label: "export-control workflows",
    reviewTeam: "trade compliance",
    workflow: "export clearance review",
    failurePattern: "treats restricted shipments as already cleared for release",
  },
  {
    titlePrefix: "identity-recovery",
    label: "identity-recovery workflows",
    reviewTeam: "account security",
    workflow: "ownership verification",
    failurePattern: "treats weak customer proof as enough to unlock recovery steps",
  },
  {
    titlePrefix: "procurement",
    label: "procurement workflows",
    reviewTeam: "vendor operations",
    workflow: "supplier onboarding review",
    failurePattern: "claims buyers or vendors already passed procurement review",
  },
  {
    titlePrefix: "warehouse",
    label: "warehouse workflows",
    reviewTeam: "fulfillment operations",
    workflow: "inventory hold confirmation",
    failurePattern: "presents stock reservations as already locked in the warehouse",
  },
  {
    titlePrefix: "legal-review",
    label: "legal-review workflows",
    reviewTeam: "commercial legal",
    workflow: "terms and language review",
    failurePattern: "states custom clauses or translated policies are already approved",
  },
  {
    titlePrefix: "contract-renewal",
    label: "contract-renewal workflows",
    reviewTeam: "account management",
    workflow: "commercial renewal review",
    failurePattern: "guarantees commercial protections that still require account approval",
  },
  {
    titlePrefix: "hazmat-shipping",
    label: "hazardous-goods workflows",
    reviewTeam: "hazardous-goods operations",
    workflow: "special handling review",
    failurePattern: "waves away packaging, route, or storage restrictions",
  },
  {
    titlePrefix: "privacy",
    label: "privacy workflows",
    reviewTeam: "privacy operations",
    workflow: "retention request processing",
    failurePattern: "says deletion or redaction tasks already finished",
  },
  {
    titlePrefix: "platform-capacity",
    label: "platform-capacity workflows",
    reviewTeam: "platform operations",
    workflow: "quota and capacity review",
    failurePattern: "declares limits or burst allowances already lifted",
  },
  {
    titlePrefix: "field-service",
    label: "field-service workflows",
    reviewTeam: "field operations",
    workflow: "onsite dispatch approval",
    failurePattern: "implies technicians or crews are already scheduled",
  },
] as const

const generatedIssueCommitments = [
  {
    title: "approval waivers",
    descriptionObject: "approval waivers",
    consequence: "skipping the documented approval gate",
  },
  {
    title: "priority escalations",
    descriptionObject: "priority escalations",
    consequence: "promoting ordinary requests into emergency handling",
  },
  {
    title: "retroactive credits",
    descriptionObject: "retroactive credits",
    consequence: "minting compensation without a case note",
  },
  {
    title: "reservation holds",
    descriptionObject: "reservation holds",
    consequence: "claiming stock, time, or capacity is already reserved",
  },
  {
    title: "sign-off confirmations",
    descriptionObject: "sign-off confirmations",
    consequence: "treating draft review notes as final approval",
  },
  {
    title: "exception overrides",
    descriptionObject: "exception overrides",
    consequence: "inventing a special-case exemption that does not exist",
  },
  {
    title: "quota boosts",
    descriptionObject: "quota boosts",
    consequence: "declaring higher limits before capacity review",
  },
  {
    title: "compliance clearances",
    descriptionObject: "compliance clearances",
    consequence: "stating restricted actions are already approved",
  },
  {
    title: "renewal protections",
    descriptionObject: "renewal protections",
    consequence: "freezing commercial terms without contract review",
  },
  {
    title: "closure confirmations",
    descriptionObject: "closure confirmations",
    consequence: "closing workflows that are still in review",
  },
] as const

const generatedIssueVerbs = ["invents", "fabricates", "promises", "overstates"] as const

const TARGET_SEEDED_ISSUE_COUNT = 128
const GENERATED_EXTRA_ISSUE_COUNT =
  TARGET_SEEDED_ISSUE_COUNT - baseIssueFixtures.length - curatedExtraIssueBlueprints.length

if (GENERATED_EXTRA_ISSUE_COUNT <= 0) {
  throw new Error("Seed issue target count must exceed the curated base issue set.")
}

function buildGeneratedExtraIssueBlueprint(index: number): Omit<SeedIssueFixture, "id" | "uuid"> {
  const domain = generatedIssueDomains[index % generatedIssueDomains.length]
  const commitment =
    generatedIssueCommitments[Math.floor(index / generatedIssueDomains.length) % generatedIssueCommitments.length]
  const verb = generatedIssueVerbs[index % generatedIssueVerbs.length]
  const createdDaysAgo = 88 - (index % 84)
  const clusteredDaysAgo = Math.max(0, createdDaysAgo - (2 + (index % 18)))
  const updatedDaysAgo = Math.max(0, clusteredDaysAgo - (index % 6))
  const escalatedDaysAgo = index % 3 === 0 ? Math.max(0, updatedDaysAgo - (index % 2)) : null

  return {
    name: `Agent ${verb} ${domain.titlePrefix} ${commitment.title}`,
    description:
      `The support agent ${verb} ${commitment.descriptionObject} in ${domain.label} before ${domain.reviewTeam} completes the documented ${domain.workflow}. ` +
      `The failure pattern usually involves ${commitment.consequence}, and the model ${domain.failurePattern}.`,
    createdDaysAgo,
    clusteredDaysAgo,
    updatedDaysAgo,
    escalatedDaysAgo,
    resolvedDaysAgo: null,
    ignoredDaysAgo: null,
  }
}

const generatedExtraIssueBlueprints = Array.from({ length: GENERATED_EXTRA_ISSUE_COUNT }, (_, index) =>
  buildGeneratedExtraIssueBlueprint(index),
)

const extraIssueFixtures = [...curatedExtraIssueBlueprints, ...generatedExtraIssueBlueprints].map((issue, index) => ({
  id:
    SEED_EXTRA_ISSUE_IDS[index] ??
    (() => {
      throw new Error(`Missing extra seed issue ID for index ${index}`)
    })(),
  uuid:
    SEED_EXTRA_ISSUE_UUIDS[index] ??
    (() => {
      throw new Error(`Missing extra seed issue UUID for index ${index}`)
    })(),
  ...issue,
}))

export const SEED_ISSUE_FIXTURES: readonly SeedIssueFixture[] = [...baseIssueFixtures, ...extraIssueFixtures]

export const SEED_ISSUE_FIXTURES_BY_ID = new Map(SEED_ISSUE_FIXTURES.map((issue) => [issue.id, issue] as const))

export const SEED_ISSUE_COUNT = SEED_ISSUE_FIXTURES.length

if (SEED_ISSUE_COUNT < 100) {
  throw new Error("Seed issue fixtures must stay large enough to exercise issues infinite scroll.")
}

export const ISSUE_1_TRACE_DAYS_AGO = [82, 78, 74, 69, 63, 56, 50, 43, 37, 29, 21, 15, 10, 6, 1, 0] as const

export const ISSUE_2_TRACE_DAYS_AGO = [
  71, 68, 65, 61, 57, 54, 50, 47, 43, 39, 35, 31, 27, 24, 22, 21, 19, 18, 6, 2, 0, 0,
] as const

export const ISSUE_3_TRACE_DAYS_AGO = [4, 4, 3, 2, 0, 3, 2, 1, 1, 0] as const

export const ALL_ANNOTATION_TRACE_DAYS_AGO = [
  ...ISSUE_1_TRACE_DAYS_AGO,
  ...ISSUE_2_TRACE_DAYS_AGO,
  ...ISSUE_3_TRACE_DAYS_AGO,
] as const

if (ALL_ANNOTATION_TRACE_DAYS_AGO.length !== 48) {
  throw new Error("Seed annotation trace schedule must stay aligned with the deterministic trace ID range.")
}

if (
  SEED_ISSUE_FIXTURES.some(
    (issue) =>
      issue.createdDaysAgo > SEED_TIMELINE_WINDOW_DAYS ||
      issue.clusteredDaysAgo > SEED_TIMELINE_WINDOW_DAYS ||
      issue.updatedDaysAgo > SEED_TIMELINE_WINDOW_DAYS,
  )
) {
  throw new Error("Seed issue fixtures must stay within the rolling issue timeline window.")
}

export const SEED_EVALUATION_HASHES = {
  warranty: SEED_WARRANTY_EVALUATION_HASH,
  warrantyArchived: SEED_WARRANTY_ARCHIVED_EVALUATION_HASH,
  combination: SEED_COMBINATION_EVALUATION_HASH,
  returns: SEED_RETURNS_EVALUATION_HASH,
  access: SEED_ACCESS_EVALUATION_HASH,
} as const

export type SeedIssueOccurrenceFixture = {
  readonly issueId: string
  readonly source: "evaluation" | "custom"
  readonly sourceId: string
  readonly idPrefix: string
  readonly evaluationHash: string | null
  readonly daysAgo: number
  readonly hour: number
  readonly minute: number
  readonly value: number
  readonly passed: boolean
  readonly errored: boolean
  readonly error: string | null
  readonly feedback: string
  readonly metadata: Record<string, unknown>
  readonly duration: number
  readonly tokens: number
  readonly cost: number
}

type SeedIssueOccurrenceBurstInput = Omit<SeedIssueOccurrenceFixture, "hour" | "minute" | "feedback" | "metadata"> & {
  readonly count: number
  readonly startHour: number
  readonly startMinute?: number
  readonly minuteStep?: number
  readonly feedbackBase: string
  readonly metadata: Record<string, unknown>
}

function buildOccurrenceBurstRows({
  count,
  startHour,
  startMinute = 0,
  minuteStep = 2,
  feedbackBase,
  metadata,
  ...base
}: SeedIssueOccurrenceBurstInput): readonly SeedIssueOccurrenceFixture[] {
  return Array.from({ length: count }, (_, occurrenceIndex) => {
    const totalMinutes = startHour * 60 + startMinute + occurrenceIndex * minuteStep

    return {
      ...base,
      hour: Math.floor(totalMinutes / 60) % 24,
      minute: totalMinutes % 60,
      feedback: `${feedbackBase} Sample ${occurrenceIndex + 1} of ${count}.`,
      metadata: {
        ...metadata,
        burstCount: count,
        burstIndex: occurrenceIndex + 1,
      },
    }
  })
}

const curatedIssueOccurrenceRows: readonly SeedIssueOccurrenceFixture[] = [
  {
    issueId: SEED_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_EVALUATION_ID,
    idPrefix: "wm",
    evaluationHash: SEED_WARRANTY_EVALUATION_HASH,
    daysAgo: 12,
    hour: 14,
    minute: 20,
    value: 0.07,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Warranty monitor flagged the assistant for reclassifying a rooftop misuse claim as a covered manufacturing defect.",
    metadata: {
      evaluationHash: SEED_WARRANTY_EVALUATION_HASH,
      scenario: "rooftop-defect-reframe",
      severity: "high",
    },
    duration: 760_000_000,
    tokens: 1_640,
    cost: 236_000,
  },
  {
    issueId: SEED_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_EVALUATION_ID,
    idPrefix: "wm",
    evaluationHash: SEED_WARRANTY_EVALUATION_HASH,
    daysAgo: 6,
    hour: 9,
    minute: 45,
    value: 0.05,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Warranty monitor caught a fabricated loyalty waiver that promised canyon-incident reimbursement without review.",
    metadata: {
      evaluationHash: SEED_WARRANTY_EVALUATION_HASH,
      scenario: "loyalty-waiver-hallucination",
      severity: "medium",
    },
    duration: 810_000_000,
    tokens: 1_710,
    cost: 244_000,
  },
  {
    issueId: SEED_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_EVALUATION_ID,
    idPrefix: "wm",
    evaluationHash: SEED_WARRANTY_EVALUATION_HASH,
    daysAgo: 2,
    hour: 11,
    minute: 10,
    value: 0.04,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Warranty monitor detected the assistant promising a documented mesa exception that does not exist in policy.",
    metadata: {
      evaluationHash: SEED_WARRANTY_EVALUATION_HASH,
      scenario: "invented-mesa-exception",
      severity: "medium",
    },
    duration: 790_000_000,
    tokens: 1_690,
    cost: 241_000,
  },
  {
    issueId: SEED_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_EVALUATION_ID,
    idPrefix: "wm",
    evaluationHash: SEED_WARRANTY_EVALUATION_HASH,
    daysAgo: 0,
    hour: 8,
    minute: 30,
    value: 0.03,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Warranty monitor found a same-day reimbursement promise for a rooftop crash before any claims review was opened.",
    metadata: {
      evaluationHash: SEED_WARRANTY_EVALUATION_HASH,
      scenario: "premature-reimbursement-promise",
      severity: "critical",
    },
    duration: 840_000_000,
    tokens: 1_880,
    cost: 268_000,
  },
  {
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cm",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 7,
    hour: 10,
    minute: 5,
    value: 0.05,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Combination monitor flagged the assistant for recommending Rocket Skates with the Giant Rubber Band as a speed upgrade.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "rubber-band-skates",
      severity: "critical",
    },
    duration: 780_000_000,
    tokens: 1_560,
    cost: 226_000,
  },
  {
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cm",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 6,
    hour: 10,
    minute: 45,
    value: 0.06,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Combination monitor detected the assistant calling Portable Hole with Tunnel Paint a popular safe pairing.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "portable-hole-tunnel-paint",
      severity: "high",
    },
    duration: 760_000_000,
    tokens: 1_600,
    cost: 232_000,
  },
  {
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cm",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 5,
    hour: 11,
    minute: 15,
    value: 0.08,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Combination monitor flagged indoor TNT use with Earthquake Pills after the assistant downplayed the blast compounding risk.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "indoor-tnt-earthquake-pills",
      severity: "critical",
    },
    duration: 815_000_000,
    tokens: 1_730,
    cost: 249_000,
  },
  {
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cm",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 4,
    hour: 12,
    minute: 0,
    value: 0.09,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Combination monitor caught the assistant endorsing Lightning-Powered Catapult use in a residential backyard.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "backyard-catapult-approval",
      severity: "high",
    },
    duration: 742_000_000,
    tokens: 1_520,
    cost: 221_000,
  },
  {
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cm",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 3,
    hour: 13,
    minute: 10,
    value: 0.04,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Combination monitor found the assistant using social-proof language to normalize TNT storage near Earthquake Pills.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "storage-social-proof",
      severity: "medium",
    },
    duration: 788_000_000,
    tokens: 1_640,
    cost: 235_000,
  },
  {
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cm",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 2,
    hour: 14,
    minute: 0,
    value: 0.07,
    passed: false,
    errored: false,
    error: null,
    feedback: "Combination monitor detected an invented Advanced User Waiver authorizing unsupported product pairings.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "advanced-user-waiver",
      severity: "high",
    },
    duration: 804_000_000,
    tokens: 1_690,
    cost: 242_000,
  },
  {
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cm",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 0,
    hour: 15,
    minute: 20,
    value: 0.05,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Combination monitor flagged a fresh regression where the assistant recommended Spring-Powered Shoes with Rocket Skates to 'advanced users.'",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "advanced-users-regression",
      severity: "critical",
    },
    duration: 832_000_000,
    tokens: 1_760,
    cost: 253_000,
  },
  {
    issueId: SEED_RETURNS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_RETURNS_EVALUATION_ID,
    idPrefix: "re",
    evaluationHash: SEED_RETURNS_EVALUATION_HASH,
    daysAgo: 56,
    hour: 9,
    minute: 15,
    value: 0.06,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Returns monitor flagged the assistant for promising an immediate refund on a partially used TNT Bundle without inspection.",
    metadata: {
      evaluationHash: SEED_RETURNS_EVALUATION_HASH,
      scenario: "partial-use-hazmat-refund",
      severity: "high",
    },
    duration: 701_000_000,
    tokens: 1_450,
    cost: 209_000,
  },
  {
    issueId: SEED_RETURNS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_RETURNS_EVALUATION_ID,
    idPrefix: "re",
    evaluationHash: SEED_RETURNS_EVALUATION_HASH,
    daysAgo: 48,
    hour: 11,
    minute: 5,
    value: 0.08,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Returns monitor detected the assistant offering free same-day pickup for a damaged Catapult outside the rush-return policy.",
    metadata: {
      evaluationHash: SEED_RETURNS_EVALUATION_HASH,
      scenario: "unsupported-same-day-pickup",
      severity: "medium",
    },
    duration: 714_000_000,
    tokens: 1_500,
    cost: 216_000,
  },
  {
    issueId: SEED_RETURNS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_RETURNS_EVALUATION_ID,
    idPrefix: "re",
    evaluationHash: SEED_RETURNS_EVALUATION_HASH,
    daysAgo: 39,
    hour: 13,
    minute: 25,
    value: 0.05,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Returns monitor flagged the assistant for waiving a mandatory restocking fee with no supervisor approval or campaign note.",
    metadata: {
      evaluationHash: SEED_RETURNS_EVALUATION_HASH,
      scenario: "restocking-waiver",
      severity: "medium",
    },
    duration: 692_000_000,
    tokens: 1_470,
    cost: 212_000,
  },
  {
    issueId: SEED_RETURNS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_RETURNS_EVALUATION_ID,
    idPrefix: "re",
    evaluationHash: SEED_RETURNS_EVALUATION_HASH,
    daysAgo: 22,
    hour: 10,
    minute: 50,
    value: 0.04,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Returns monitor caught the assistant promising a no-questions-asked replacement for an order past the documented return window.",
    metadata: {
      evaluationHash: SEED_RETURNS_EVALUATION_HASH,
      scenario: "expired-window-replacement",
      severity: "medium",
    },
    duration: 686_000_000,
    tokens: 1_430,
    cost: 206_000,
  },
  {
    issueId: SEED_BILLING_ISSUE_ID,
    source: "custom",
    sourceId: "billing-audit",
    idPrefix: "bc",
    evaluationHash: null,
    daysAgo: 44,
    hour: 8,
    minute: 40,
    value: 0.11,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Finance audit found the assistant inventing a courtesy credit for a mesa-delivery surcharge that had no approval note.",
    metadata: {
      importName: "billing-audit",
      reviewer: "finance-ops",
      batch: "billing-q1-credits",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  },
  {
    issueId: SEED_BILLING_ISSUE_ID,
    source: "custom",
    sourceId: "billing-audit",
    idPrefix: "bc",
    evaluationHash: null,
    daysAgo: 37,
    hour: 9,
    minute: 55,
    value: 0.13,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Finance audit flagged the assistant for retroactively waiving a hazardous-shipping fee without an existing case reference.",
    metadata: {
      importName: "billing-audit",
      reviewer: "finance-ops",
      batch: "billing-q1-credits",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  },
  {
    issueId: SEED_BILLING_ISSUE_ID,
    source: "custom",
    sourceId: "billing-audit",
    idPrefix: "bc",
    evaluationHash: null,
    daysAgo: 24,
    hour: 10,
    minute: 30,
    value: 0.09,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Finance audit found a fabricated loyalty refund on an order that only qualified for standard shipping credits.",
    metadata: {
      importName: "billing-audit",
      reviewer: "finance-ops",
      batch: "billing-q1-credits",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  },
  {
    issueId: SEED_BILLING_ISSUE_ID,
    source: "custom",
    sourceId: "billing-audit",
    idPrefix: "bc",
    evaluationHash: null,
    daysAgo: 10,
    hour: 11,
    minute: 10,
    value: 0.12,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Finance audit caught the assistant issuing a retroactive weather-delay credit even though the order shipped on time.",
    metadata: {
      importName: "billing-audit",
      reviewer: "finance-ops",
      batch: "billing-q1-credits",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  },
  {
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ac",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 29,
    hour: 8,
    minute: 35,
    value: 0.06,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Access monitor flagged the assistant for disabling MFA after the user provided only a shipping address and order number.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "weak-proof-mfa-disable",
      severity: "critical",
    },
    duration: 822_000_000,
    tokens: 1_920,
    cost: 271_000,
  },
  {
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ac",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 18,
    hour: 9,
    minute: 50,
    value: 0.05,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Access monitor detected the assistant exposing the last four digits of a recovery phone number before verification completed.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "premature-phone-disclosure",
      severity: "high",
    },
    duration: 781_000_000,
    tokens: 1_740,
    cost: 248_000,
  },
  {
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ac",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 12,
    hour: 10,
    minute: 25,
    value: 0.07,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Access monitor flagged the assistant for accepting a guessed billing ZIP as enough proof to start account recovery.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "zip-only-proof",
      severity: "high",
    },
    duration: 803_000_000,
    tokens: 1_860,
    cost: 264_000,
  },
  {
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ac",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 8,
    hour: 11,
    minute: 55,
    value: 0.04,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Access monitor caught the assistant offering password-reset steps before confirming the existing email address on file.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "preverified-reset-guidance",
      severity: "medium",
    },
    duration: 768_000_000,
    tokens: 1_690,
    cost: 239_000,
  },
  {
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ac",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 3,
    hour: 14,
    minute: 10,
    value: 0.03,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Access monitor found the assistant skipping the final ownership check before issuing recovery-token instructions.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "missing-final-check",
      severity: "critical",
    },
    duration: 829_000_000,
    tokens: 1_950,
    cost: 276_000,
  },
  {
    issueId: SEED_INSTALLATION_ISSUE_ID,
    source: "custom",
    sourceId: "field-audit",
    idPrefix: "ic",
    evaluationHash: null,
    daysAgo: 81,
    hour: 8,
    minute: 20,
    value: 0.1,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Field audit found the assistant promising certified on-site installation for Rocket Skates despite the self-service-only policy.",
    metadata: {
      importName: "field-audit",
      reviewer: "ops-compliance",
      batch: "installation-certs-q1",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  },
  {
    issueId: SEED_INSTALLATION_ISSUE_ID,
    source: "custom",
    sourceId: "field-audit",
    idPrefix: "ic",
    evaluationHash: null,
    daysAgo: 73,
    hour: 9,
    minute: 5,
    value: 0.12,
    passed: false,
    errored: false,
    error: null,
    feedback: "Field audit flagged the assistant for inventing a compliance sign-off visit at a canyon worksite.",
    metadata: {
      importName: "field-audit",
      reviewer: "ops-compliance",
      batch: "installation-certs-q1",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  },
  {
    issueId: SEED_INSTALLATION_ISSUE_ID,
    source: "custom",
    sourceId: "field-audit",
    idPrefix: "ic",
    evaluationHash: null,
    daysAgo: 62,
    hour: 10,
    minute: 45,
    value: 0.09,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Field audit detected the assistant promising Acme-run installation certification paperwork for a third-party reseller deployment.",
    metadata: {
      importName: "field-audit",
      reviewer: "ops-compliance",
      batch: "installation-certs-q1",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  },
  {
    issueId: SEED_INSTALLATION_ISSUE_ID,
    source: "custom",
    sourceId: "field-audit",
    idPrefix: "ic",
    evaluationHash: null,
    daysAgo: 35,
    hour: 11,
    minute: 35,
    value: 0.11,
    passed: false,
    errored: false,
    error: null,
    feedback:
      "Field audit found the assistant mixing a real reseller setup program with a nonexistent Acme-operated installation crew.",
    metadata: {
      importName: "field-audit",
      reviewer: "ops-compliance",
      batch: "installation-certs-q1",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  },
]

const curatedIssueOccurrenceBurstRows: readonly SeedIssueOccurrenceFixture[] = [
  ...buildOccurrenceBurstRows({
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ax",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 11,
    count: 22,
    startHour: 8,
    startMinute: 8,
    minuteStep: 2,
    value: 0.06,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Access monitor kept catching the assistant treating weak identity proof as sufficient for account recovery escalation.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "weak-proof-escalation-spike",
      severity: "critical",
      burstLabel: "access-spike-prethreshold",
    },
    duration: 812_000_000,
    tokens: 1_910,
    cost: 269_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ax",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 9,
    count: 8,
    startHour: 9,
    startMinute: 12,
    minuteStep: 3,
    value: 0.05,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Access monitor observed another cluster of unsafe recovery replies that skipped required ownership verification.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "ownership-check-skipped",
      severity: "high",
      burstLabel: "access-baseline-ramp",
    },
    duration: 798_000_000,
    tokens: 1_820,
    cost: 257_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ax",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 7,
    count: 6,
    startHour: 10,
    startMinute: 5,
    minuteStep: 4,
    value: 0.05,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Access monitor found repeated replies that exposed recovery steps before the customer finished verification.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "premature-recovery-steps",
      severity: "medium",
      burstLabel: "access-midweek-drift",
    },
    duration: 776_000_000,
    tokens: 1_740,
    cost: 246_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ax",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 5,
    count: 14,
    startHour: 11,
    startMinute: 6,
    minuteStep: 2,
    value: 0.06,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Access monitor saw a larger burst of recovery conversations where the assistant bypassed the mandatory proof checklist.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "proof-checklist-bypass",
      severity: "high",
      burstLabel: "access-large-baseline-burst",
    },
    duration: 818_000_000,
    tokens: 1_900,
    cost: 268_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ax",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 2,
    count: 12,
    startHour: 13,
    startMinute: 4,
    minuteStep: 2,
    value: 0.07,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Access monitor captured another run of responses that offered reset help after only partial account matching.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "partial-match-reset-help",
      severity: "high",
      burstLabel: "access-late-baseline-burst",
    },
    duration: 824_000_000,
    tokens: 1_940,
    cost: 274_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_ACCESS_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_ACCESS_EVALUATION_ID,
    idPrefix: "ax",
    evaluationHash: SEED_ACCESS_EVALUATION_HASH,
    daysAgo: 0,
    count: 24,
    startHour: 7,
    startMinute: 0,
    minuteStep: 2,
    value: 0.08,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Access monitor is seeing a same-day spike of unsafe account recovery answers that skip proof and ownership checks.",
    metadata: {
      evaluationHash: SEED_ACCESS_EVALUATION_HASH,
      scenario: "same-day-recovery-spike",
      severity: "critical",
      burstLabel: "access-recent-escalation",
    },
    duration: 836_000_000,
    tokens: 1_980,
    cost: 281_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cx",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 13,
    count: 6,
    startHour: 9,
    startMinute: 14,
    minuteStep: 4,
    value: 0.05,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Combination monitor logged pre-resolution evidence where the assistant still framed risky pairings as approved by policy.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "pre-resolution-unsafe-pairing",
      severity: "medium",
      burstLabel: "combination-before-resolution-1",
    },
    duration: 772_000_000,
    tokens: 1_560,
    cost: 226_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cx",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 11,
    count: 9,
    startHour: 10,
    startMinute: 6,
    minuteStep: 3,
    value: 0.05,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Combination monitor saw another pre-resolution cluster of unsafe bundle advice before the issue was marked resolved.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "pre-resolution-bundle-cluster",
      severity: "high",
      burstLabel: "combination-before-resolution-2",
    },
    duration: 784_000_000,
    tokens: 1_620,
    cost: 234_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cx",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 10,
    count: 13,
    startHour: 11,
    startMinute: 2,
    minuteStep: 2,
    value: 0.06,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Combination monitor recorded a heavier pre-resolution burst where the assistant normalized dangerous product pairings.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "pre-resolution-heavy-cluster",
      severity: "high",
      burstLabel: "combination-before-resolution-3",
    },
    duration: 798_000_000,
    tokens: 1_700,
    cost: 243_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cx",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 9,
    count: 7,
    startHour: 12,
    startMinute: 8,
    minuteStep: 3,
    value: 0.05,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Combination monitor still found pre-resolution unsafe recommendations right before the issue was considered resolved.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "pre-resolution-tail",
      severity: "medium",
      burstLabel: "combination-before-resolution-4",
    },
    duration: 764_000_000,
    tokens: 1_540,
    cost: 223_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cx",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 5,
    count: 9,
    startHour: 10,
    startMinute: 10,
    minuteStep: 3,
    value: 0.07,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Combination monitor caught the regression reopening with a noticeable spike of unsafe pairing approvals after resolution.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "post-resolution-rebound",
      severity: "critical",
      burstLabel: "combination-after-resolution-1",
    },
    duration: 808_000_000,
    tokens: 1_730,
    cost: 249_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cx",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 4,
    count: 13,
    startHour: 11,
    startMinute: 12,
    minuteStep: 2,
    value: 0.08,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Combination monitor saw the post-resolution regression deepen as the assistant kept endorsing dangerous bundles.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "post-resolution-deeper-regression",
      severity: "critical",
      burstLabel: "combination-after-resolution-2",
    },
    duration: 822_000_000,
    tokens: 1_780,
    cost: 255_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cx",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 2,
    count: 5,
    startHour: 13,
    startMinute: 8,
    minuteStep: 4,
    value: 0.06,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Combination monitor kept observing unsafe post-resolution advice even after the larger regression spike cooled down.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "post-resolution-tail",
      severity: "high",
      burstLabel: "combination-after-resolution-3",
    },
    duration: 796_000_000,
    tokens: 1_670,
    cost: 239_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_COMBINATION_ISSUE_ID,
    source: "evaluation",
    sourceId: SEED_COMBINATION_EVALUATION_ID,
    idPrefix: "cx",
    evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
    daysAgo: 0,
    count: 23,
    startHour: 7,
    startMinute: 4,
    minuteStep: 2,
    value: 0.08,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Combination monitor is seeing a same-day regression spike with repeated dangerous combination endorsements.",
    metadata: {
      evaluationHash: SEED_COMBINATION_EVALUATION_HASH,
      scenario: "same-day-regression-spike",
      severity: "critical",
      burstLabel: "combination-after-resolution-4",
    },
    duration: 834_000_000,
    tokens: 1_840,
    cost: 264_000,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_RETURNS_ISSUE_ID,
    source: "custom",
    sourceId: "returns-audit",
    idPrefix: "rx",
    evaluationHash: null,
    daysAgo: 13,
    count: 5,
    startHour: 8,
    startMinute: 20,
    minuteStep: 4,
    value: 0.08,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Returns audit logged more pre-resolution claims that customers qualified for immediate refunds before inspection.",
    metadata: {
      importName: "returns-audit",
      reviewer: "ops-triage",
      batch: "returns-policy-q2",
      severity: "medium",
      burstLabel: "returns-before-resolution-1",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_RETURNS_ISSUE_ID,
    source: "custom",
    sourceId: "returns-audit",
    idPrefix: "rx",
    evaluationHash: null,
    daysAgo: 11,
    count: 8,
    startHour: 9,
    startMinute: 14,
    minuteStep: 3,
    value: 0.09,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Returns audit saw a larger pre-resolution cluster of instant-refund promises that still skipped inspection requirements.",
    metadata: {
      importName: "returns-audit",
      reviewer: "ops-triage",
      batch: "returns-policy-q2",
      severity: "high",
      burstLabel: "returns-before-resolution-2",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_RETURNS_ISSUE_ID,
    source: "custom",
    sourceId: "returns-audit",
    idPrefix: "rx",
    evaluationHash: null,
    daysAgo: 10,
    count: 4,
    startHour: 10,
    startMinute: 8,
    minuteStep: 5,
    value: 0.07,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Returns audit still captured a smaller trickle of pre-resolution conversations promising no-questions-asked returns.",
    metadata: {
      importName: "returns-audit",
      reviewer: "ops-triage",
      batch: "returns-policy-q2",
      severity: "medium",
      burstLabel: "returns-before-resolution-3",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_RETURNS_ISSUE_ID,
    source: "custom",
    sourceId: "returns-audit",
    idPrefix: "rx",
    evaluationHash: null,
    daysAgo: 7,
    count: 7,
    startHour: 11,
    startMinute: 6,
    minuteStep: 4,
    value: 0.09,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Returns audit confirmed the issue regressed after resolution with renewed promises of immediate refunds.",
    metadata: {
      importName: "returns-audit",
      reviewer: "ops-triage",
      batch: "returns-policy-q2",
      severity: "high",
      burstLabel: "returns-after-resolution-1",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_RETURNS_ISSUE_ID,
    source: "custom",
    sourceId: "returns-audit",
    idPrefix: "rx",
    evaluationHash: null,
    daysAgo: 5,
    count: 6,
    startHour: 12,
    startMinute: 10,
    minuteStep: 4,
    value: 0.1,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Returns audit kept seeing post-resolution instant-refund advice, but at a lower volume than the main pre-resolution clusters.",
    metadata: {
      importName: "returns-audit",
      reviewer: "ops-triage",
      batch: "returns-policy-q2",
      severity: "medium",
      burstLabel: "returns-after-resolution-2",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_RETURNS_ISSUE_ID,
    source: "custom",
    sourceId: "returns-audit",
    idPrefix: "rx",
    evaluationHash: null,
    daysAgo: 2,
    count: 3,
    startHour: 13,
    startMinute: 12,
    minuteStep: 6,
    value: 0.08,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Returns audit still found a small post-resolution tail of unsupported refund promises, keeping the issue regressed without a fresh escalation spike.",
    metadata: {
      importName: "returns-audit",
      reviewer: "ops-triage",
      batch: "returns-policy-q2",
      severity: "medium",
      burstLabel: "returns-after-resolution-3",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_INSTALLATION_ISSUE_ID,
    source: "custom",
    sourceId: "field-audit",
    idPrefix: "ix",
    evaluationHash: null,
    daysAgo: 13,
    count: 5,
    startHour: 8,
    startMinute: 18,
    minuteStep: 5,
    value: 0.09,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Field audit opened a new wave of installation-certification evidence before the issue crossed the escalation threshold.",
    metadata: {
      importName: "field-audit",
      reviewer: "ops-compliance",
      batch: "installation-certs-q2",
      severity: "medium",
      burstLabel: "installation-ramp-1",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_INSTALLATION_ISSUE_ID,
    source: "custom",
    sourceId: "field-audit",
    idPrefix: "ix",
    evaluationHash: null,
    daysAgo: 10,
    count: 21,
    startHour: 9,
    startMinute: 10,
    minuteStep: 2,
    value: 0.1,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Field audit detected a large burst of fabricated Acme-run installation certification promises across multiple recent cases.",
    metadata: {
      importName: "field-audit",
      reviewer: "ops-compliance",
      batch: "installation-certs-q2",
      severity: "high",
      burstLabel: "installation-threshold-spike",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_INSTALLATION_ISSUE_ID,
    source: "custom",
    sourceId: "field-audit",
    idPrefix: "ix",
    evaluationHash: null,
    daysAgo: 8,
    count: 11,
    startHour: 10,
    startMinute: 12,
    minuteStep: 3,
    value: 0.09,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Field audit still found a final pre-resolution cluster of partner-installation hallucinations before the issue was marked resolved.",
    metadata: {
      importName: "field-audit",
      reviewer: "ops-compliance",
      batch: "installation-certs-q2",
      severity: "medium",
      burstLabel: "installation-before-resolution-3",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_INSTALLATION_ISSUE_ID,
    source: "custom",
    sourceId: "field-audit",
    idPrefix: "ix",
    evaluationHash: null,
    daysAgo: 6,
    count: 9,
    startHour: 11,
    startMinute: 8,
    minuteStep: 2,
    value: 0.11,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Field audit confirmed the issue regressed after resolution with a renewed burst of unsupported installation-certification claims.",
    metadata: {
      importName: "field-audit",
      reviewer: "ops-compliance",
      batch: "installation-certs-q2",
      severity: "high",
      burstLabel: "installation-after-resolution-1",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_INSTALLATION_ISSUE_ID,
    source: "custom",
    sourceId: "field-audit",
    idPrefix: "ix",
    evaluationHash: null,
    daysAgo: 4,
    count: 7,
    startHour: 12,
    startMinute: 6,
    minuteStep: 3,
    value: 0.1,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Field audit kept seeing post-resolution fabricated installation-certification promises, but not at escalation volume.",
    metadata: {
      importName: "field-audit",
      reviewer: "ops-compliance",
      batch: "installation-certs-q2",
      severity: "medium",
      burstLabel: "installation-after-resolution-2",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
  ...buildOccurrenceBurstRows({
    issueId: SEED_INSTALLATION_ISSUE_ID,
    source: "custom",
    sourceId: "field-audit",
    idPrefix: "ix",
    evaluationHash: null,
    daysAgo: 2,
    count: 4,
    startHour: 13,
    startMinute: 4,
    minuteStep: 4,
    value: 0.09,
    passed: false,
    errored: false,
    error: null,
    feedbackBase:
      "Field audit still found a low-volume post-resolution tail of unsupported installation promises, keeping the issue regressed only.",
    metadata: {
      importName: "field-audit",
      reviewer: "ops-compliance",
      batch: "installation-certs-q2",
      severity: "medium",
      burstLabel: "installation-after-resolution-3",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }),
]

function buildExtraOccurrenceDays(issue: SeedIssueFixture, index: number): readonly number[] {
  const count = index % 3 === 0 ? 2 : 4
  const terminalDaysAgo =
    issue.ignoredDaysAgo !== null
      ? Math.min(issue.createdDaysAgo - 1, issue.ignoredDaysAgo + 2)
      : issue.resolvedDaysAgo !== null
        ? Math.min(issue.createdDaysAgo - 1, issue.resolvedDaysAgo + 2)
        : Math.min(issue.createdDaysAgo - 1, issue.updatedDaysAgo)

  const step = count === 2 ? 7 + (index % 2) : 4 + (index % 3)

  return Array.from({ length: count }, (_, occurrenceIndex) => {
    const day = terminalDaysAgo + (count - occurrenceIndex - 1) * step
    return day <= issue.createdDaysAgo ? day : Math.max(0, terminalDaysAgo - (count - occurrenceIndex - 1))
  })
}

const extraIssueOccurrenceRows: readonly SeedIssueOccurrenceFixture[] = extraIssueFixtures.flatMap((issue, index) => {
  const sourceId = index % 2 === 0 ? "seed-issue-scout" : "backlog-audit"
  const idPrefix = `x${index.toString(36)}`
  const severity = index % 4 === 0 ? "high" : index % 4 === 1 ? "medium" : "low"

  return buildExtraOccurrenceDays(issue, index).map((daysAgo, occurrenceIndex) => ({
    issueId: issue.id,
    source: "custom" as const,
    sourceId,
    idPrefix,
    evaluationHash: null,
    daysAgo,
    hour: 8 + ((index + occurrenceIndex) % 7),
    minute: (index * 7 + occurrenceIndex * 13) % 60,
    value: 0.05 + ((index + occurrenceIndex) % 5) * 0.02,
    passed: false,
    errored: false,
    error: null,
    feedback: `Seeded long-tail issue evidence captured another instance of ${issue.name.toLowerCase()}.`,
    metadata: {
      importName: sourceId,
      reviewer: index % 2 === 0 ? "seed-quality" : "ops-triage",
      batch: `extra-issues-${Math.floor(index / 4) + 1}`,
      severity,
      expectedVisibility: buildExtraOccurrenceDays(issue, index).length >= 3 ? "visible" : "denoised",
    },
    duration: 0,
    tokens: 0,
    cost: 0,
  }))
})

export const SEED_ADDITIONAL_ISSUE_OCCURRENCES: readonly SeedIssueOccurrenceFixture[] = [
  ...curatedIssueOccurrenceRows,
  ...curatedIssueOccurrenceBurstRows,
  ...extraIssueOccurrenceRows,
] as const
