# RFC: Migrate to Scoped/Unscoped Queries and Remove Repositories/Data-Access Layers

Status: Draft
Owners: Core Platform
Target: packages/core first, then apps/web and apps/gateway

## Problem

We still have legacy repositories and ad-hoc data-access layers mixed with the new
query functions. This causes duplicated access patterns, inconsistent tenancy
handling, and makes changes harder to trace or enforce. We need a unified read
layer based on scoped/unscoped query functions and to remove repositories and
data-access layers entirely.

## Goals

- Make query functions the single source of truth for reads.
- Enforce workspace tenancy at the query boundary via scopedQuery.
- Replace repositories and data-access layers across the codebase.
- Standardize query function signatures and naming.
- Reduce cognitive overhead by consolidating read logic.

## Non-Goals

- Changing the write service layer pattern (Result/Transaction).
- Overhauling schema models or migrations.
- Re-architecting services or job orchestration.

## Current State (Recent Commits)

- Introduced function-based query abstraction in packages/core/src/queries with
  scopedQuery/unscopedQuery, migrated projects/users as proof of concept.
- Removed ProjectsRepository and UsersRepository and swapped ~65 call sites to
  query functions.
- Refactored project queries to return raw rows and aligned call sites.
- Fixed users query tests and tightened behavior.

## Proposed Architecture

- All read operations live under packages/core/src/queries/.
- Two entrypoints:
  - scopedQuery(fn) for workspace-scoped reads ({ workspaceId, ...filters }).
  - unscopedQuery(fn) for global reads.
- Query modules are small, single-purpose exported functions (no classes).
- Call sites use query functions directly or via thin helpers in app layers.

## Inventory (Legacy Layers to Migrate/Remove)

### Repositories (packages/core/src/repositories/)

- packages/core/src/repositories/apiKeysRepository.ts
- packages/core/src/repositories/claimedPromocodesRepository.ts
- packages/core/src/repositories/claimedRewardsRepository.ts
- packages/core/src/repositories/commitsRepository/index.ts
- packages/core/src/repositories/commitsRepository/utils/buildCommitsScope.ts
- packages/core/src/repositories/commitsRepository/utils/getHeadCommit.ts
- packages/core/src/repositories/datasetsRepository.ts
- packages/core/src/repositories/datasetRowsRepository.ts
- packages/core/src/repositories/deploymentTestsRepository.ts
- packages/core/src/repositories/documentIntegrationReferencesRepository.ts
- packages/core/src/repositories/documentTriggersRepository.ts
- packages/core/src/repositories/documentTriggerEventsRepository.ts
- packages/core/src/repositories/documentVersionsRepository/index.ts
- packages/core/src/repositories/evaluationResultsV2Repository.ts
- packages/core/src/repositories/evaluationsV2Repository.ts
- packages/core/src/repositories/experimentsRepository.ts
- packages/core/src/repositories/featuresRepository.ts
- packages/core/src/repositories/grantsRepository.ts
- packages/core/src/repositories/integrationHeaderPresetsRepository.ts
- packages/core/src/repositories/integrationsRepository.ts
- packages/core/src/repositories/issueEvaluationResultsRepository.ts
- packages/core/src/repositories/issueHistogramsRepository.ts
- packages/core/src/repositories/issuesRepository.ts
- packages/core/src/repositories/latteRequestsRepository.ts
- packages/core/src/repositories/latteThreadsRepository.ts
- packages/core/src/repositories/latitudeApiKeysRepository.ts
- packages/core/src/repositories/membershipsRepository.ts
- packages/core/src/repositories/optimizationsRepository.ts
- packages/core/src/repositories/providerApiKeysRepository.ts
- packages/core/src/repositories/publishedDocumentsRepository.ts
- packages/core/src/repositories/spansRepository.ts
- packages/core/src/repositories/subscriptionsRepository.ts
- packages/core/src/repositories/workspacesRepository.ts
- packages/core/src/repositories/workspaceFeaturesRepository.ts

Infrastructure (remove once unused):

- packages/core/src/repositories/index.ts
- packages/core/src/repositories/repository.ts
- packages/core/src/repositories/repositoryV2.ts

### Core data-access modules (packages/core/src/data-access/)

- packages/core/src/data-access/apiKeys.ts
- packages/core/src/data-access/claimedRewards.ts
- packages/core/src/data-access/commits.ts
- packages/core/src/data-access/conversations/fetchConversation.ts
- packages/core/src/data-access/conversations/fetchConversationWithMessages.ts
- packages/core/src/data-access/conversations/fetchConversations.ts
- packages/core/src/data-access/conversations/getResultsForConversation.ts
- packages/core/src/data-access/conversations/shared.ts
- packages/core/src/data-access/documentTriggers.ts
- packages/core/src/data-access/evaluations/buildEvaluatedSpan.ts
- packages/core/src/data-access/experiments/buildApiParams.ts
- packages/core/src/data-access/experiments/parseApiExperimentsFilterParams.ts
- packages/core/src/data-access/experiments/parseExperimentsFilterParams.ts
- packages/core/src/data-access/exports/findByUuid.ts
- packages/core/src/data-access/integrations/headerPresets/list.ts
- packages/core/src/data-access/issues/getAnnotationsProgress.ts
- packages/core/src/data-access/issues/getEvaluationResultsToGenerateEvaluation.ts
- packages/core/src/data-access/issues/getHITLSpansByDocument.ts
- packages/core/src/data-access/issues/getHITLSpansByIssue.ts
- packages/core/src/data-access/issues/getSpanMessagesAndEvaluationResultsByIssue.ts
- packages/core/src/data-access/issues/getSpanMessagesByIssueDocument.ts
- packages/core/src/data-access/issues/getSpansByIssue.ts
- packages/core/src/data-access/issues/getSpansWithoutIssues.ts
- packages/core/src/data-access/issues/hasUnprocessedSpans.ts
- packages/core/src/data-access/magicLinkTokens.ts
- packages/core/src/data-access/memberships.ts
- packages/core/src/data-access/promocodes.ts
- packages/core/src/data-access/runs.ts
- packages/core/src/data-access/traces/countByDocument.ts
- packages/core/src/data-access/traces/hasProductionTraces.ts
- packages/core/src/data-access/weeklyEmail/activeWorkspaces/index.ts
- packages/core/src/data-access/weeklyEmail/annotations/index.ts
- packages/core/src/data-access/weeklyEmail/issues/index.ts
- packages/core/src/data-access/weeklyEmail/logs/index.ts
- packages/core/src/data-access/weeklyEmail/utils.ts
- packages/core/src/data-access/workspaces.ts

### App data-access wrappers

- apps/web/src/app/(private)/\_data-access/index.ts
- apps/web/src/app/(public)/\_data_access/index.ts

### Exclusions (Deprecated Models)

- documentLogs\* repositories/data-access modules are excluded from migration.
- providerLogs\* repositories/data-access modules are excluded from migration.

## Proposed Mapping to Query Modules

### Repositories to queries

- apiKeysRepository.ts -> queries/apiKeys/\*
- claimedPromocodesRepository.ts -> queries/claimedPromocodes/\*
- claimedRewardsRepository.ts -> queries/claimedRewards/\*
- commitsRepository/index.ts -> queries/commits/\*
- commitsRepository/utils/buildCommitsScope.ts -> queries/commits/filters.ts
- commitsRepository/utils/getHeadCommit.ts -> queries/commits/getHeadCommit.ts
- datasetsRepository.ts -> queries/datasets/\*
- datasetRowsRepository.ts -> queries/datasets/rows/\*
- deploymentTestsRepository.ts -> queries/deploymentTests/\*
- documentIntegrationReferencesRepository.ts -> queries/documentIntegrationReferences/\*
- documentTriggersRepository.ts -> queries/documentTriggers/\*
- documentTriggerEventsRepository.ts -> queries/documentTriggerEvents/\*
- documentVersionsRepository/index.ts -> queries/documentVersions/\*
- evaluationResultsV2Repository.ts -> queries/evaluationResultsV2/\*
- evaluationsV2Repository.ts -> queries/evaluationsV2/\*
- experimentsRepository.ts -> queries/experiments/\*
- featuresRepository.ts -> queries/features/\*
- grantsRepository.ts -> queries/grants/\*
- integrationHeaderPresetsRepository.ts -> queries/integrationHeaderPresets/\*
- integrationsRepository.ts -> queries/integrations/\*
- issueEvaluationResultsRepository.ts -> queries/issueEvaluationResults/\*
- issueHistogramsRepository.ts -> queries/issueHistograms/\*
- issuesRepository.ts -> queries/issues/\*
- latteRequestsRepository.ts -> queries/latteRequests/\*
- latteThreadsRepository.ts -> queries/latteThreads/\*
- latitudeApiKeysRepository.ts -> queries/latitudeApiKeys/\*
- membershipsRepository.ts -> queries/memberships/\*
- optimizationsRepository.ts -> queries/optimizations/\*
- providerApiKeysRepository.ts -> queries/providerApiKeys/\*
- publishedDocumentsRepository.ts -> queries/publishedDocuments/\*
- spansRepository.ts -> queries/spans/\*
- subscriptionsRepository.ts -> queries/subscriptions/\*
- workspacesRepository.ts -> queries/workspaces/\*
- workspaceFeaturesRepository.ts -> queries/workspaceFeatures/\*

### Data-access to queries

- data-access/apiKeys.ts -> queries/apiKeys/\*
- data-access/claimedRewards.ts -> queries/claimedRewards/\*
- data-access/commits.ts -> queries/commits/\*
- data-access/conversations/_ -> queries/conversations/_
- data-access/documentTriggers.ts -> queries/documentTriggers/\*
- data-access/evaluations/buildEvaluatedSpan.ts -> queries/evaluationsV2/buildEvaluatedSpan.ts
- data-access/experiments/_ -> queries/experiments/_
- data-access/exports/findByUuid.ts -> queries/exports/findByUuid.ts
- data-access/integrations/headerPresets/list.ts -> queries/integrationHeaderPresets/list.ts
- data-access/issues/_ -> queries/issues/_
- data-access/magicLinkTokens.ts -> queries/magicLinkTokens/\*
- data-access/memberships.ts -> queries/memberships/\*
- data-access/promocodes.ts -> queries/claimedPromocodes/_ or queries/promocodes/_
- data-access/runs.ts -> queries/runs/\*
- data-access/traces/_ -> queries/traces/_
- data-access/weeklyEmail/_ -> queries/weeklyEmail/_
- data-access/workspaces.ts -> queries/workspaces/\*

### App data-access wrappers

- apps/web/src/app/(private)/\_data-access/index.ts -> replace with direct query usage
- apps/web/src/app/(public)/\_data_access/index.ts -> replace with direct query usage

## Migration Plan

### Phase 1: Inventory and Coverage

- Enumerate remaining repositories and data-access modules.
- Map repository methods to new query functions.
- Identify read call sites in services, jobs, actions, and API routes.

### Phase 2: Query Module Expansion

- Create query functions for each repository/data-access method.
- Use scopedQuery for tenanted reads and unscopedQuery for global reads.
- Keep signatures consistent: (filters, db?).

### Phase 3: Replace Call Sites

- Replace repository/data-access usage with query functions.
- Keep behavior identical; avoid business logic changes.

### Phase 4: Remove Legacy Layers

- Delete repository classes, exports, and tests.
- Delete data-access modules once unused.
- Remove references in docs and code comments.

### Phase 5: Standardize and Harden

- Enforce query-only read patterns via lint or docs.
- Provide clear guidelines for scoped vs unscoped usage.

## First Migration Batch (Adjusted)

1. spans + runs (deferred)
2. issues + evaluationResultsV2 (issues: DONE, evaluationResultsV2: deferred)
3. integrations + integrationHeaderPresets (DONE)

## Migration Status

### Completed

| Legacy File                                      | Query Module                                                                      | Status                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------- |
| `issuesRepository.ts`                            | `queries/issues/*`                                                                | Migrated and removed                         |
| `issueEvaluationResultsRepository.ts`            | `queries/issueEvaluationResults/*`                                                | Migrated and removed                         |
| `issueHistogramsRepository.ts`                   | `queries/issueHistograms/*`                                                       | Migrated and removed                         |
| `integrationsRepository.ts`                      | `queries/integrations/*`                                                          | Migrated and removed                         |
| `integrationHeaderPresetsRepository.ts`          | `queries/integrationHeaderPresets/*`                                              | Migrated and removed                         |
| `data-access/issues/*`                           | `queries/issues/*`                                                                | Moved and removed                            |
| `data-access/integrations/headerPresets/list.ts` | `queries/integrationHeaderPresets/*`                                              | Migrated and removed                         |
| `projectsRepository.ts` (prior work)             | `queries/projects/*`                                                              | Migrated and removed                         |
| `usersRepository.ts` (prior work)                | `queries/users/*`                                                                 | Migrated and removed                         |
| `apiKeysRepository.ts`                           | `queries/apiKeys/*`                                                               | Migrated and removed                         |
| `providerApiKeysRepository.ts`                   | `queries/providerApiKeys/*`                                                       | Migrated and removed                         |
| `latitudeApiKeysRepository.ts`                   | `queries/apiKeys/findFirst`                                                       | Migrated and removed (same table as apiKeys) |
| `data-access/apiKeys.ts`                         | `queries/apiKeys/unsafelyGetApiKeyByToken`, `unsafelyGetFirstApiKeyByWorkspaceId` | Migrated and removed                         |

### Deferred

| Legacy File                        | Reason               |
| ---------------------------------- | -------------------- |
| `spansRepository.ts`               | Skipped per request  |
| `evaluationResultsV2Repository.ts` | Skipped per request  |
| `commitsRepository/`               | Not in current batch |
| All other repositories             | Not in current batch |

## Guidelines

### Query Naming

- findX, findAllX, findFirstX, findXByY, unsafelyFindX (for unscoped reads).

### Tenancy Rules

- Any query that can be scoped must be scoped.
- Unscoped queries require explicit unsafe naming unless truly global.

### Error Handling

- Let scopedQuery/unscopedQuery surface real errors; avoid local catch blocks.

## Risks

- Missed call sites in apps/services.
- Subtle changes in query return shapes.
- Accidental use of unscoped queries for tenant data.

## Mitigations

- Ripgrep-based inventory before and after each phase.
- Verify with pnpm tc and focused tests per package.
- Add a migration checklist to engineering docs.

## Acceptance Criteria

- No repository classes remain in the repo.
- All read access uses query functions in packages/core/src/queries/.
- data-access layers are removed or converted to query usage.
- pnpm tc and relevant package tests pass.
