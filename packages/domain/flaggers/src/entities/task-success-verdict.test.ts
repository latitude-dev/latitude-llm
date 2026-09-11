import { FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH, scoringArtifactVersionSchema } from "@domain/scores"
import { describe, expect, it } from "vitest"
import { FLAGGER_DEFAULT_CLASSIFIER_MODEL } from "../constants.ts"
import { taskSuccessJudgmentVersion, taskSuccessVerdictSchema } from "./task-success-verdict.ts"

describe("taskSuccessVerdictSchema", () => {
  it("requires feedback on the two scoring verdicts and a reason on the coverage verdicts", () => {
    expect(taskSuccessVerdictSchema.safeParse({ verdict: "success", feedback: "Delivered." }).success).toBe(true)
    expect(taskSuccessVerdictSchema.safeParse({ verdict: "failure", feedback: "Never delivered." }).success).toBe(true)
    expect(taskSuccessVerdictSchema.safeParse({ verdict: "success" }).success).toBe(false)
    expect(taskSuccessVerdictSchema.safeParse({ verdict: "indeterminate", reason: "Truncated." }).success).toBe(true)
    expect(taskSuccessVerdictSchema.safeParse({ verdict: "indeterminate", feedback: "Truncated." }).success).toBe(false)
  })
})

describe("taskSuccessJudgmentVersion", () => {
  it("stays readable and persistable for the default judge", () => {
    const version = taskSuccessJudgmentVersion(FLAGGER_DEFAULT_CLASSIFIER_MODEL)

    expect(version).toContain(FLAGGER_DEFAULT_CLASSIFIER_MODEL.model)
    expect(scoringArtifactVersionSchema.safeParse(version).success).toBe(true)
  })

  it("gives a substituted judge its own version", () => {
    const hosted = taskSuccessJudgmentVersion({ provider: "amazon-bedrock", model: "anthropic.claude-haiku-4-5" })
    const selfHosted = taskSuccessJudgmentVersion({ provider: "ollama", model: "llama-3.1-8b" })

    expect(hosted).not.toBe(selfHosted)
  })

  it("digests a judge identity too long for the persisted version column", () => {
    const version = taskSuccessJudgmentVersion({ provider: "custom", model: "m".repeat(200) })
    const sibling = taskSuccessJudgmentVersion({ provider: "custom", model: `${"m".repeat(199)}n` })

    expect(version.length).toBeLessThanOrEqual(FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH)
    expect(scoringArtifactVersionSchema.safeParse(version).success).toBe(true)
    expect(version).not.toBe(sibling)
  })
})
