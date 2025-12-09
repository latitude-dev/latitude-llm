# Shadow Testing & A/B Testing Feature Proposal

## Executive Summary

This proposal outlines the implementation of **Shadow Testing** and **A/B Testing** capabilities for Latitude, allowing users to safely test optimized/distilled prompts against their production (live) baseline before full deployment.

---

## 1. Data Modeling

### 1.1 New Database Tables

#### `deployment_tests` (Main Test Configuration Table)

Tests are scoped to **commits**, not documents. A single test can evaluate changes across multiple documents in the challenger commit compared to the baseline commit.

```sql
CREATE TABLE deployment_tests (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Version Configuration
  baseline_commit_id BIGINT NOT NULL REFERENCES commits(id), -- Live/control version
  challenger_commit_id BIGINT NOT NULL REFERENCES commits(id), -- Shadow/B version

  -- Test Type & Settings
  test_type VARCHAR(20) NOT NULL, -- 'shadow' | 'ab'
  traffic_percentage INTEGER DEFAULT 50, -- For A/B: % of traffic to challenger (0-100)

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'paused' | 'completed' | 'cancelled'
  started_at TIMESTAMP,
  ended_at TIMESTAMP,

  -- Metadata
  name VARCHAR(256),
  description TEXT,
  created_by_user_id TEXT REFERENCES users(id),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_deployment_tests_workspace ON deployment_tests(workspace_id);
CREATE INDEX idx_deployment_tests_project ON deployment_tests(project_id);
CREATE INDEX idx_deployment_tests_status ON deployment_tests(status);
```

#### `deployment_test_runs` (Track Individual Runs)

```sql
CREATE TABLE deployment_test_runs (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  deployment_test_id BIGINT NOT NULL REFERENCES deployment_tests(id) ON DELETE CASCADE,

  -- Run Context
  api_request_id VARCHAR(256), -- Original API request identifier
  custom_identifier VARCHAR(256), -- User's custom identifier

  -- Routing Decision
  routed_to VARCHAR(20) NOT NULL, -- 'baseline' | 'challenger'

  -- Linked Runs
  baseline_document_log_uuid UUID, -- Always populated (the production response)
  challenger_document_log_uuid UUID, -- For shadow: simulated run; For A/B: actual run (if routed)

  -- Timing
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_test_runs_test ON deployment_test_runs(deployment_test_id);
CREATE INDEX idx_test_runs_request ON deployment_test_runs(api_request_id);
```

### 1.2 Schema Updates

#### Update `LogSources` enum (packages/constants/src/models.ts)

```typescript
export enum LogSources {
  // ... existing values ...
  ShadowTest = 'shadow_test', // Shadow challenger runs (simulated)
  ABTestBaseline = 'ab_test_baseline', // A/B test baseline runs
  ABTestChallenger = 'ab_test_challenger', // A/B test challenger runs
}
```

#### Add to `spans` table (Optional metadata)

```sql
ALTER TABLE spans ADD COLUMN deployment_test_id BIGINT REFERENCES deployment_tests(id);
```

### 1.3 Events

Add to `events.d.ts`:

```typescript
export type DeploymentTestStarted = LatitudeEventGeneric<
  'deploymentTestStarted',
  { workspaceId: number; testId: number; testType: 'shadow' | 'ab' }
>

export type DeploymentTestCompleted = LatitudeEventGeneric<
  'deploymentTestCompleted',
  {
    workspaceId: number
    testId: number
    testType: 'shadow' | 'ab'
    results: DeploymentTestResults
  }
>

export type DeploymentTestRunCreated = LatitudeEventGeneric<
  'deploymentTestRunCreated',
  { workspaceId: number; testId: number; runId: number }
>
```

---

## 2. Core Logic

### 2.1 Shadow Testing Flow

```
API Request → Gateway
     │
     ├─► Check for active shadow test on (project, document)
     │       │
     │       └─► If found:
     │               │
     │               ├─► Run BASELINE (production) → Return response to caller
     │               │
     │               └─► Async: Enqueue CHALLENGER run with simulation mode
     │                         │
     │                         └─► Run evaluations on both
     │
     └─► If not found:
             └─► Normal production run
```

**Key Points:**

- Shadow runs use `simulationSettings: { simulateToolResponses: true }` to prevent side effects
- Shadow runs are **non-blocking** - they don't affect response latency
- Both runs are linked via `deployment_test_runs` for comparison

### 2.2 A/B Testing Flow

```
API Request → Gateway
     │
     ├─► Check for active A/B test on (project, document)
     │       │
     │       └─► If found:
     │               │
     │               ├─► Route decision (weighted random based on traffic_percentage)
     │               │       │
     │               │       ├─► BASELINE: Run baseline version → Return response
     │               │       │
     │               │       └─► CHALLENGER: Run challenger version → Return response
     │               │
     │               └─► Track routing decision in deployment_test_runs
     │
     └─► If not found:
             └─► Normal production run
```

**Key Points:**

- A/B runs are **real production runs** - no simulation
- Routing is deterministic per `customIdentifier` if provided (session stickiness)
- Results reflect actual production performance

### 2.3 Routing Algorithm

```typescript
function routeRequest(
  test: DeploymentTest,
  customIdentifier?: string,
): 'baseline' | 'challenger' {
  // Session stickiness: same user/session gets same variant
  if (customIdentifier) {
    const hash = hashString(customIdentifier + test.uuid)
    return hash % 100 < test.trafficPercentage ? 'challenger' : 'baseline'
  }

  // Random routing
  return Math.random() * 100 < test.trafficPercentage
    ? 'challenger'
    : 'baseline'
}
```

---

## 3. Service Layer

### 3.1 Services to Create

```
packages/core/src/services/deploymentTests/
├── create.ts           # Create new deployment test
├── start.ts            # Start test (set to running)
├── pause.ts            # Pause test
├── stop.ts             # Stop/complete test
├── destroy.ts          # Delete test
├── getActiveForDocument.ts  # Find active test for a document
├── routeRequest.ts     # Determine routing for A/B
├── createRun.ts        # Record a test run
├── getResults.ts       # Aggregate results for comparison
└── index.ts
```

### 3.2 Repository

```typescript
// packages/core/src/repositories/deploymentTestsRepository.ts

export class DeploymentTestsRepository extends RepositoryLegacy<...> {
  // Find active test for a specific document
  async findActiveForDocument(projectId: number, documentUuid: string): Promise<DeploymentTest | null>

  // Get test with aggregated results
  async getWithResults(testId: number): Promise<DeploymentTestWithResults>

  // List tests for a project
  async listByProject(projectId: number): Promise<DeploymentTest[]>

  // Get runs for a test with evaluation results
  async getRunsWithEvaluations(testId: number, options: PaginationOptions): Promise<DeploymentTestRunWithEvaluations[]>
}
```

### 3.3 Modified Run Handler

Modify `apps/gateway/src/routes/api/v3/projects/versions/documents/run/run.handler.ts`:

```typescript
export const runHandler: AppRouteHandler<RunRoute> = async (c) => {
  // ... existing validation ...

  const { document, commit, project } = await getData(...)

  // Check for active deployment test
  const activeTest = await getActiveDeploymentTest({
    projectId: project.id,
    documentUuid: document.documentUuid,
  })

  if (activeTest) {
    if (activeTest.testType === 'shadow') {
      return handleShadowTestRun({ c, activeTest, ... })
    } else if (activeTest.testType === 'ab') {
      return handleABTestRun({ c, activeTest, ... })
    }
  }

  // Normal run flow
  return handleForegroundRun(...)
}
```

---

## 4. User Interface

### 4.1 Navigation Structure

Add new routes to `services/routes.ts`:

```typescript
export enum DocumentRoutes {
  // ... existing ...
  testing = 'testing',  // New tab for shadow/A/B testing
}

// In ROUTES.projects.detail().commits.detail().documents.detail()
[DocumentRoutes.testing]: {
  root: `${root}/testing`,
  new: `${root}/testing/new`,
  detail: ({ uuid }: { uuid: string }) => ({
    root: `${root}/testing/${uuid}`,
    comparison: `${root}/testing/${uuid}/comparison`,
  }),
},
```

### 4.2 UI Pages & Components

```
apps/web/src/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/(withTabs)/
└── testing/
    ├── page.tsx                    # Main testing dashboard
    ├── new/
    │   └── page.tsx                # Create new test wizard
    └── [testUuid]/
        ├── page.tsx                # Test detail/monitoring
        └── comparison/
            └── page.tsx            # Side-by-side comparison
```

### 4.3 UI Wireframes

#### 4.3.1 Testing Dashboard (Main Tab)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Testing                                                    [+ New Test]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ Active Test ───────────────────────────────────────────────────┐   │
│  │  🔴 Shadow Test: "GPT-4o-mini optimization v2"                  │   │
│  │                                                                  │   │
│  │  Baseline: v23 (Live)  →  Challenger: Draft                     │   │
│  │  Status: Running (since 2h ago)                                 │   │
│  │                                                                  │   │
│  │  Progress: 234 runs compared                                    │   │
│  │  ├── Baseline avg score: 78.3%                                  │   │
│  │  └── Challenger avg score: 82.1% (+3.8%)                        │   │
│  │                                                                  │   │
│  │  [View Comparison]  [Pause]  [Stop Test]                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Previous Tests ────────────────────────────────────────────────┐   │
│  │  Name                  Type     Duration    Result       Actions │   │
│  │  ─────────────────────────────────────────────────────────────── │   │
│  │  Claude optimization   A/B      3 days      Challenger ✓  View   │   │
│  │  Temperature test      Shadow   1 day       Baseline ✓    View   │   │
│  │  Model comparison      Shadow   12 hours    Cancelled     View   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 4.3.2 New Test Wizard

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Create New Test                                              [Cancel]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: Choose Test Type                                               │
│  ┌────────────────────────────┐  ┌────────────────────────────┐        │
│  │  🌑 Shadow Testing         │  │  🔀 A/B Testing            │        │
│  │                            │  │                            │        │
│  │  Run challenger in         │  │  Split traffic between     │        │
│  │  parallel (simulated).     │  │  versions (real runs).     │        │
│  │  No impact on users.       │  │  Real performance data.    │        │
│  │                            │  │                            │        │
│  │  Best for: Initial         │  │  Best for: Final           │        │
│  │  validation before A/B.    │  │  validation before deploy. │        │
│  └────────────────────────────┘  └────────────────────────────┘        │
│                                                                         │
│  Step 2: Select Versions                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Baseline (Control):  [v23 - "Add caching" (Live) ▼]            │   │
│  │  Challenger (Test):   [Draft - "GPT-4o-mini optimization" ▼]    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Step 3: Configure Evaluations                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ☑ Use composite evaluation (recommended)                       │   │
│  │  ☑ Quality Score (LLM)                                          │   │
│  │  ☑ Response Accuracy (LLM)                                      │   │
│  │  ☐ Format Compliance (Rule)                                     │   │
│  │  ☑ User Feedback (Human)                                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Step 4: Traffic Split (A/B only)                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Baseline: 50% ◄═══════════════════════════►  Challenger: 50%   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│                                            [Back]  [Create & Start]     │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 4.3.3 Test Comparison View

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Shadow Test: "GPT-4o-mini optimization v2"           [Pause] [Stop]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ Overview Stats ───────────────────────────────────────────────┐    │
│  │                                                                 │    │
│  │  Total Runs: 234        Duration: 2h 34m        Status: Running│    │
│  │                                                                 │    │
│  │  ┌─────────────────────┐  ┌─────────────────────┐              │    │
│  │  │    BASELINE         │  │    CHALLENGER       │              │    │
│  │  │    v23 (Live)       │  │    Draft            │              │    │
│  │  │                     │  │                     │              │    │
│  │  │  Avg Score: 78.3%   │  │  Avg Score: 82.1%  ↑│              │    │
│  │  │  Avg Cost: $0.012   │  │  Avg Cost: $0.003  ↓│              │    │
│  │  │  Avg Latency: 1.2s  │  │  Avg Latency: 0.8s*│              │    │
│  │  │  Avg Tokens: 1,234  │  │  Avg Tokens: 456   ↓│              │    │
│  │  └─────────────────────┘  └─────────────────────┘              │    │
│  │                           * Simulated, may differ in production │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─ Evaluation Breakdown ──────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  Evaluation          Baseline     Challenger    Diff    Winner  │   │
│  │  ────────────────────────────────────────────────────────────── │   │
│  │  Composite Score     78.3%        82.1%         +3.8%   ★ Chal  │   │
│  │  ├─ Quality Score    82.0%        85.2%         +3.2%   ★ Chal  │   │
│  │  ├─ Accuracy         74.5%        78.9%         +4.4%   ★ Chal  │   │
│  │  └─ Format           88.0%        89.1%         +1.1%   ★ Chal  │   │
│  │  User Feedback       4.2/5        4.1/5         -0.1    Base    │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Individual Runs ───────────────────────────────────────────────┐   │
│  │  [Filter by: All ▼]  [Search...]                                │   │
│  │                                                                  │   │
│  │  Run ID      Time     Baseline    Challenger   Winner           │   │
│  │  ──────────────────────────────────────────────────────────────  │   │
│  │  run_abc123  2m ago   ✓ 85%       ✓ 88%        Challenger       │   │
│  │  run_def456  5m ago   ✓ 72%       ✓ 71%        Baseline         │   │
│  │  run_ghi789  8m ago   ✓ 80%       ✗ Error      Baseline         │   │
│  │                                                                  │   │
│  │  [Click row to see side-by-side output comparison]              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Recommendation ────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  Based on 234 runs, the CHALLENGER version shows:               │   │
│  │  • +3.8% improvement in composite score                         │   │
│  │  • 75% cost reduction                                           │   │
│  │  • Similar quality metrics                                      │   │
│  │                                                                  │   │
│  │  Recommended action: Consider A/B testing with real traffic     │   │
│  │                                                                  │   │
│  │  [Start A/B Test]        [Deploy Challenger]        [Keep Live] │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 4.3.4 Individual Run Comparison Modal

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Run Comparison: run_abc123                                      [×]    │
├─────────────────────────────────────────────────────────────────────────┤
│  Input Parameters:                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  { "query": "How do I reset my password?", "user_id": "u_123" } │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Baseline Output ──────────────┐ ┌─ Challenger Output ──────────┐   │
│  │                                │ │                              │   │
│  │  To reset your password:       │ │  Here's how to reset your   │   │
│  │                                │ │  password:                   │   │
│  │  1. Go to Settings             │ │                              │   │
│  │  2. Click "Security"           │ │  1. Click your profile icon │   │
│  │  3. Select "Reset Password"    │ │  2. Go to Settings >        │   │
│  │  4. Follow the instructions    │ │     Security                 │   │
│  │     sent to your email         │ │  3. Select "Reset Password" │   │
│  │                                │ │                              │   │
│  │  Model: gpt-4o                 │ │  Model: gpt-4o-mini         │   │
│  │  Tokens: 1,234                 │ │  Tokens: 456                │   │
│  │  Cost: $0.012                  │ │  Cost: $0.003               │   │
│  │  Latency: 1.2s                 │ │  Latency: 0.8s (simulated)  │   │
│  │                                │ │                              │   │
│  │  Score: 85%                    │ │  Score: 88%                 │   │
│  └────────────────────────────────┘ └──────────────────────────────┘   │
│                                                                         │
│  ┌─ Evaluations ───────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  Quality Score:   Baseline: 84% ✓    Challenger: 87% ✓         │   │
│  │  Accuracy:        Baseline: 82% ✓    Challenger: 86% ✓         │   │
│  │  Format:          Baseline: 90% ✓    Challenger: 92% ✓         │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Version Selector Enhancement

Update the version selector (draft picker) to show when a test is active:

```
┌─ Current Version ─────────────────────────────────┐
│  v23 - "Add caching" (Live)                       │
│  🧪 Shadow test running against Draft             │
├───────────────────────────────────────────────────┤
│  Draft - "GPT-4o-mini optimization" (in test)     │
│  v23 - "Add caching" ← Live                       │
│  v22 - "Bug fix"                                  │
│  v21 - "Initial release"                          │
└───────────────────────────────────────────────────┘
```

---

## 5. API Changes

### 5.1 New Endpoints

```
POST   /api/v3/projects/:projectId/tests              # Create test
GET    /api/v3/projects/:projectId/tests              # List tests
GET    /api/v3/projects/:projectId/tests/:testUuid    # Get test details
PATCH  /api/v3/projects/:projectId/tests/:testUuid    # Update test (pause/resume)
DELETE /api/v3/projects/:projectId/tests/:testUuid    # Delete test
POST   /api/v3/projects/:projectId/tests/:testUuid/stop     # Stop test
GET    /api/v3/projects/:projectId/tests/:testUuid/results  # Get comparison results
GET    /api/v3/projects/:projectId/tests/:testUuid/runs     # Get individual runs
```

### 5.2 Run API Response Enhancement

The existing run API response should include test metadata when applicable:

```typescript
// When a request is part of a deployment test
{
  uuid: "...",
  response: {...},
  // New field
  deploymentTest: {
    testUuid: "test_xxx",
    testType: "ab",
    routedTo: "challenger",
    isChallenger: true
  }
}
```

---

## 6. Automatic Test Termination

When a challenger version is published (merged), any active tests involving it should be automatically stopped:

```typescript
// In packages/core/src/services/commits/merge.ts

async function mergeCommit(commit: Commit, ...) {
  // ... existing merge logic ...

  // Stop any deployment tests that involve this commit
  await stopDeploymentTestsForCommit({
    projectId: commit.projectId,
    commitId: commit.id,
    reason: 'challenger_deployed'
  })

  // ... rest of merge logic ...
}
```

---

## 7. Feature Flag

Create a new feature flag for gradual rollout:

```sql
INSERT INTO features (name, description, enabled) VALUES
('deployment-testing', 'Enable shadow and A/B testing features', false);
```

---

## 8. Implementation Phases

### Phase 1: Data Model & Core Services (1-2 weeks)

1. Create database migrations for new tables
2. Implement `DeploymentTestsRepository`
3. Implement core services (create, start, stop, route)
4. Add feature flag
5. Write tests

### Phase 2: Shadow Testing (1-2 weeks)

1. Modify run handler to detect shadow tests
2. Implement parallel simulated runs
3. Link runs and evaluations
4. Add WebSocket events for real-time updates
5. Write tests

### Phase 3: A/B Testing (1 week)

1. Implement routing logic with session stickiness
2. Modify run handler for A/B routing
3. Track routing decisions
4. Write tests

### Phase 4: UI - Dashboard & Test Creation (1-2 weeks)

1. Create testing tab and dashboard
2. Build test creation wizard
3. Implement test list with status indicators
4. Add actions (pause, stop, delete)

### Phase 5: UI - Comparison & Results (1-2 weeks)

1. Build comparison view
2. Implement evaluation breakdown charts
3. Create individual run comparison modal
4. Add recommendation engine

### Phase 6: Polish & Integration (1 week)

1. Auto-stop tests on merge
2. Version selector enhancements
3. Documentation
4. Edge case handling
5. Performance optimization

---

## 9. Considerations & Trade-offs

### 9.1 Shadow Testing Limitations

- **Simulated performance**: Latency and throughput metrics won't reflect real production
- **Tool behavior**: Simulated tool responses may differ from real ones
- **Cost**: Running shadow tests doubles LLM costs (though uses cheaper simulation)

### 9.2 A/B Testing Considerations

- **Session stickiness**: Using `customIdentifier` ensures users see consistent behavior
- **Statistical significance**: Should add sample size recommendations
- **Ramp-up**: Consider gradual traffic increase (10% → 25% → 50%)

### 9.3 Evaluation Timing

- **Automatic evaluations**: Evaluations configured on commits run automatically on both baseline and challenger
- **No configuration needed**: Since the challenger commit is created as part of the test setup, evaluations already configured on it will run automatically via the existing `evaluateLiveLogs` system
- **Comparison fairness**: Both versions evaluated with the same evaluations at the same time

### 9.4 Edge Cases

- **What if baseline commit is deleted?** → Test becomes invalid, auto-stop
- **What if document is deleted?** → Test becomes invalid, auto-stop
- **Multiple tests on same document?** → Prevented by unique constraint
- **Test during merge?** → Auto-stop test when challenger is deployed

---

## 10. Future Enhancements

1. **Multi-armed bandit**: Auto-adjust traffic based on performance
2. **Automatic winner selection**: Stop test when statistical significance reached
3. **Rollback support**: Quick revert if challenger performs worse
4. **Canary deployments**: Gradual traffic increase with automatic rollback
5. **Integration with CI/CD**: Trigger tests on PR merge

---

This proposal provides a comprehensive foundation for implementing shadow and A/B testing while integrating smoothly with Latitude's existing architecture (commits, evaluations, experiments, feature flags).
