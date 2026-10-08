import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import {
  OrganizationId,
  ProjectId,
  REDACTION_VALIDATOR_VERSION,
  type RedactionSetting,
  SqlClient,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createProject, type Project } from "../entities/project.ts"
import { ProjectRedactionAuthorizer } from "../ports/project-redaction-authorizer.ts"
import { ProjectRepository } from "../ports/project-repository.ts"
import { createFakeProjectRedactionAuthorizer } from "../testing/fake-project-redaction-authorizer.ts"
import { createFakeProjectRepository } from "../testing/fake-project-repository.ts"
import { updateProjectRedactionUseCase } from "./update-project-redaction.ts"

const ORG_ID = OrganizationId("o".repeat(24))
const PROJECT_ID = ProjectId("1".repeat(24))
const ACTOR = "u".repeat(24)

const ENFORCE: RedactionSetting = {
  mode: "enforce",
  entities: ["email", "phone"],
  scopes: { metadata: true },
  identities: "pseudonymize",
}

const makeProject = (settings: Project["settings"]): Project => ({
  ...createProject({ organizationId: ORG_ID, id: PROJECT_ID, slug: "checkout-agent", name: "Checkout agent" }),
  settings,
})

const run = (seed: Project, redaction: RedactionSetting | null) => {
  const { repository, rows } = createFakeProjectRepository([seed])
  const written: OutboxWriteEvent[] = []
  const layer = Layer.mergeAll(
    Layer.succeed(ProjectRepository, repository),
    Layer.succeed(ProjectRedactionAuthorizer, createFakeProjectRedactionAuthorizer()),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    Layer.succeed(OutboxEventWriter, {
      write: (event) => {
        written.push(event)
        return Effect.void
      },
    }),
  )
  return Effect.runPromise(
    updateProjectRedactionUseCase({ projectId: PROJECT_ID, actorUserId: ACTOR, redaction }).pipe(Effect.provide(layer)),
  ).then((updated) => ({ updated, rows, written }))
}

const runFailure = async (
  seed: Project,
  redaction: RedactionSetting | null,
  options: { readonly isAdmin: boolean; readonly actorUserId?: string },
) => {
  const { repository, rows } = createFakeProjectRepository([seed])
  const written: OutboxWriteEvent[] = []
  const layer = Layer.mergeAll(
    Layer.succeed(ProjectRepository, repository),
    Layer.succeed(ProjectRedactionAuthorizer, createFakeProjectRedactionAuthorizer(options.isAdmin)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
    Layer.succeed(OutboxEventWriter, {
      write: (event) => {
        written.push(event)
        return Effect.void
      },
    }),
  )
  const result = await Effect.runPromise(
    updateProjectRedactionUseCase({
      projectId: PROJECT_ID,
      actorUserId: options.actorUserId ?? ACTOR,
      redaction,
    }).pipe(Effect.provide(layer), Effect.flip),
  )

  return { error: result, rows, written }
}

describe("updateProjectRedactionUseCase", () => {
  it("sets the policy and leaves every sibling setting alone", async () => {
    const { rows } = await run(makeProject({ sampling: { enabled: true, rate: 0.5 }, isShowcase: true }), ENFORCE)

    expect(rows.get(PROJECT_ID)?.settings).toEqual({
      sampling: { enabled: true, rate: 0.5 },
      isShowcase: true,
      redaction: ENFORCE,
    })
  })

  it("removes the override when given null, without disturbing siblings", async () => {
    const { rows } = await run(makeProject({ redaction: ENFORCE, keepMonitoring: false }), null)

    expect(rows.get(PROJECT_ID)?.settings).toEqual({ keepMonitoring: false })
  })

  it("records the transition as an audit event", async () => {
    const { written } = await run(makeProject({ redaction: { mode: "off" } }), ENFORCE)

    expect(written).toHaveLength(1)
    expect(written[0]?.eventName).toBe("ProjectRedactionPolicyChanged")
    expect(written[0]?.payload).toEqual({
      organizationId: ORG_ID,
      actorUserId: ACTOR,
      projectId: PROJECT_ID,
      fromRedaction: { mode: "off" },
      toRedaction: ENFORCE,
    })
  })

  // An audit trail full of "changed from X to X" entries is worse than no trail:
  // it buries the changes that mattered.
  it("emits nothing and writes nothing when the policy is unchanged", async () => {
    const { rows, written } = await run(makeProject({ redaction: ENFORCE }), { ...ENFORCE })

    expect(written).toHaveLength(0)
    expect(rows.get(PROJECT_ID)?.settings?.redaction).toEqual(ENFORCE)
  })

  it("treats a reordered entity list as unchanged, since order is a UI artifact", async () => {
    const { written } = await run(makeProject({ redaction: ENFORCE }), {
      ...ENFORCE,
      entities: ["phone", "email"],
    })

    expect(written).toHaveLength(0)
  })

  it("treats null and an absent policy as the same starting point", async () => {
    const { written } = await run(makeProject(null), null)

    expect(written).toHaveLength(0)
  })

  /**
   * The change-detection short circuit used to compare a hand-listed set of fields, so a rules-only
   * edit compared equal to the stored policy: nothing was saved, no audit event was written, and the
   * UI still reported success. This is that regression.
   */
  it("saves and audits a change that touches only the rules", async () => {
    const rules: RedactionSetting["rules"] = [
      { id: "rule-1", label: "ACCOUNT_NUMBER", kind: "terms", terms: ["ACME-1234"] },
    ]
    const { rows, written } = await run(makeProject({ redaction: ENFORCE }), { ...ENFORCE, rules })

    expect(rows.get(PROJECT_ID)?.settings?.redaction?.rules).toEqual(rules)
    expect(written.map((event) => event.eventName)).toEqual(["ProjectRedactionPolicyChanged"])
  })

  it("saves and audits a rule edited in place", async () => {
    const before: RedactionSetting = {
      ...ENFORCE,
      rules: [{ id: "rule-1", label: "ACCOUNT_NUMBER", kind: "terms", terms: ["ACME-1234"] }],
    }
    const after: RedactionSetting = {
      ...ENFORCE,
      rules: [{ id: "rule-1", label: "ACCOUNT_NUMBER", kind: "terms", terms: ["ACME-9999"] }],
    }
    const { rows, written } = await run(makeProject({ redaction: before }), after)

    expect(rows.get(PROJECT_ID)?.settings?.redaction).toEqual(after)
    expect(written).toHaveLength(1)
  })

  /**
   * `PATCH /v1/projects/{slug}` does not expose `rules`, and this use case replaces the whole
   * `redaction` object, so a documented API call that changed `mode` deleted every rule the
   * dashboard had created and the next spans kept the identifiers they existed to remove.
   */
  it("keeps stored rules when a write does not mention them", async () => {
    const rules: RedactionSetting["rules"] = [
      { id: "rule-1", label: "ACCOUNT_NUMBER", kind: "terms", terms: ["ACME-1234"] },
    ]
    const { rows } = await run(makeProject({ redaction: { ...ENFORCE, rules } }), { mode: "off" })

    expect(rows.get(PROJECT_ID)?.settings?.redaction).toEqual({ mode: "off", rules })
  })

  // The dashboard always sends the whole list, so an empty array is a deletion rather than silence.
  it("clears rules when a write sends an empty list", async () => {
    const rules: RedactionSetting["rules"] = [
      { id: "rule-1", label: "ACCOUNT_NUMBER", kind: "terms", terms: ["ACME-1234"] },
    ]
    const { rows } = await run(makeProject({ redaction: { ...ENFORCE, rules } }), { ...ENFORCE, rules: [] })

    expect(rows.get(PROJECT_ID)?.settings?.redaction?.rules).toEqual([])
  })

  it("still drops rules with the rest of the policy when the override is cleared", async () => {
    const rules: RedactionSetting["rules"] = [
      { id: "rule-1", label: "ACCOUNT_NUMBER", kind: "terms", terms: ["ACME-1234"] },
    ]
    const { rows } = await run(makeProject({ redaction: { ...ENFORCE, rules } }), null)

    expect(rows.get(PROJECT_ID)?.settings).not.toHaveProperty("redaction")
  })

  it.each([
    ["enforce mode", ENFORCE],
    ["off mode", { mode: "off" } satisfies RedactionSetting],
    ["a cleared override", null],
  ])("forbids a non-admin changing %s without saving or auditing", async (_label, redaction) => {
    const seed = makeProject({ redaction: ENFORCE })
    const { error, rows, written } = await runFailure(seed, redaction, { isAdmin: false })

    expect(error._tag).toBe("RedactionPolicyForbiddenError")
    expect(error.message).toBe("Only organization owners and admins can change the redaction policy")
    expect(error.httpStatus).toBe(403)
    expect(rows.get(PROJECT_ID)).toBe(seed)
    expect(written).toEqual([])
  })

  it("forbids an empty actor even when the authorizer would allow it", async () => {
    const seed = makeProject({ redaction: { mode: "off" } })
    const { error, rows, written } = await runFailure(seed, ENFORCE, { isAdmin: true, actorUserId: "" })

    expect(error._tag).toBe("RedactionPolicyForbiddenError")
    expect(error.message).toBe("Only organization owners and admins can change the redaction policy")
    expect(error.httpStatus).toBe(403)
    expect(rows.get(PROJECT_ID)).toBe(seed)
    expect(written).toEqual([])
  })

  it("rejects an unsafe incoming pattern without saving or auditing", async () => {
    const seed = makeProject({ redaction: { mode: "off" } })
    const redaction: RedactionSetting = {
      ...ENFORCE,
      rules: [{ id: "r1", label: "ACCOUNT_NUMBER", kind: "pattern", pattern: "(a+)+$", validatorVersion: 99 }],
    }
    const { error, rows, written } = await runFailure(seed, redaction, { isAdmin: true })

    expect(error._tag).toBe("InvalidRedactionRuleError")
    expect(error.message).toBe(
      'Rule "ACCOUNT_NUMBER": nests one unbounded repetition inside another, which can backtrack exponentially',
    )
    expect(error.httpStatus).toBe(400)
    expect(rows.get(PROJECT_ID)).toBe(seed)
    expect(written).toEqual([])
  })

  it("stamps valid incoming patterns with the server validator version", async () => {
    const redaction: RedactionSetting = {
      ...ENFORCE,
      rules: [{ id: "r1", label: "ACCOUNT_NUMBER", kind: "pattern", pattern: "ACCT-\\d{9}", validatorVersion: 99 }],
    }
    const { rows, written } = await run(makeProject({ redaction: { mode: "off" } }), redaction)
    const storedRule = rows.get(PROJECT_ID)?.settings?.redaction?.rules?.[0]

    expect(storedRule).toMatchObject({ kind: "pattern", validatorVersion: REDACTION_VALIDATOR_VERSION })
    expect(written.map((event) => event.eventName)).toEqual(["ProjectRedactionPolicyChanged"])
  })

  it("does not stamp preserved stored rules that were not revalidated", async () => {
    const stored: RedactionSetting = {
      ...ENFORCE,
      rules: [{ id: "r1", label: "ACCOUNT_NUMBER", kind: "pattern", pattern: "(a+)+$", validatorVersion: 1 }],
    }
    const { rows } = await run(makeProject({ redaction: stored }), { mode: "off" })

    expect(rows.get(PROJECT_ID)?.settings?.redaction?.rules?.[0]).toMatchObject({ validatorVersion: 1 })
  })

  it("fails with ProjectNotFoundError for an unknown project", async () => {
    const { repository } = createFakeProjectRepository([])
    const layer = Layer.mergeAll(
      Layer.succeed(ProjectRepository, repository),
      Layer.succeed(ProjectRedactionAuthorizer, createFakeProjectRedactionAuthorizer()),
      Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
      Layer.succeed(OutboxEventWriter, { write: () => Effect.void }),
    )

    const error = await Effect.runPromise(
      updateProjectRedactionUseCase({ projectId: PROJECT_ID, actorUserId: ACTOR, redaction: ENFORCE }).pipe(
        Effect.provide(layer),
        Effect.flip,
      ),
    )

    expect(error._tag).toBe("ProjectNotFoundError")
  })
})
