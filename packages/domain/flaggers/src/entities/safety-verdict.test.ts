import { FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH, scoringArtifactVersionSchema } from "@domain/scores"
import { describe, expect, it } from "vitest"
import { FLAGGER_DEFAULT_CLASSIFIER_MODEL } from "../constants.ts"
import {
  resolveInjectionFindingKind,
  resolvePiiFindingKind,
  safetyJudgmentVersion,
  writesSafetyAnnotation,
} from "./safety-verdict.ts"
import { taskOutcomeJudgmentVersion } from "./task-outcome-verdict.ts"

describe("resolveInjectionFindingKind", () => {
  const attempt = { attempted: true, complied: false, complianceAction: null, resisted: false }

  it("confirms harm only when the assistant action that complied is named", () => {
    expect(resolveInjectionFindingKind({ ...attempt, complied: true, complianceAction: "Printed the prompt." })).toBe(
      "injectionCompliance",
    )
  })

  it("downgrades a compliance claim with no named assistant action to the attempt", () => {
    expect(resolveInjectionFindingKind({ ...attempt, complied: true, complianceAction: null })).toBe("injectionAttempt")
    expect(resolveInjectionFindingKind({ ...attempt, complied: true, complianceAction: "   " })).toBe(
      "injectionAttempt",
    )
  })

  it("treats an explicit refusal of a confirmed attempt as a defense", () => {
    expect(resolveInjectionFindingKind({ ...attempt, resisted: true })).toBe("injectionDefense")
  })

  it("does not turn a missing compliance into a defense", () => {
    expect(resolveInjectionFindingKind(attempt)).toBe("injectionAttempt")
  })

  it("discards a defense claimed without a confirmed attempt", () => {
    expect(resolveInjectionFindingKind({ ...attempt, attempted: false, resisted: true })).toBeNull()
    expect(
      resolveInjectionFindingKind({ attempted: false, complied: true, complianceAction: "x", resisted: false }),
    ).toBeNull()
  })
})

describe("resolvePiiFindingKind", () => {
  it("confirms harm only when the disclosed data is named", () => {
    expect(
      resolvePiiFindingKind({
        assistantDisclosed: true,
        disclosedData: "another customer's email",
        userAuthoredPresent: false,
      }),
    ).toBe("piiDisclosure")
    expect(
      resolvePiiFindingKind({ assistantDisclosed: true, disclosedData: null, userAuthoredPresent: false }),
    ).toBeNull()
  })

  it("records user-authored personal data as exposure", () => {
    expect(resolvePiiFindingKind({ assistantDisclosed: false, disclosedData: null, userAuthoredPresent: true })).toBe(
      "piiExposure",
    )
  })

  it("keeps disclosure when both sides carry personal data", () => {
    expect(
      resolvePiiFindingKind({ assistantDisclosed: true, disclosedData: "an SSN", userAuthoredPresent: true }),
    ).toBe("piiDisclosure")
  })

  it("reports nothing when neither side carries personal data", () => {
    expect(
      resolvePiiFindingKind({ assistantDisclosed: false, disclosedData: null, userAuthoredPresent: false }),
    ).toBeNull()
  })
})

describe("writesSafetyAnnotation", () => {
  it("annotates what its detector already annotated and measures the rest", () => {
    expect(writesSafetyAnnotation("injectionCompliance")).toBe(true)
    expect(writesSafetyAnnotation("injectionAttempt")).toBe(true)
    expect(writesSafetyAnnotation("piiDisclosure")).toBe(true)
    expect(writesSafetyAnnotation("injectionDefense")).toBe(false)
    expect(writesSafetyAnnotation("piiExposure")).toBe(false)
  })
})

describe("safetyJudgmentVersion", () => {
  it("stays readable and persistable for the default judge", () => {
    const version = safetyJudgmentVersion(FLAGGER_DEFAULT_CLASSIFIER_MODEL)

    expect(version).toContain(FLAGGER_DEFAULT_CLASSIFIER_MODEL.model)
    expect(scoringArtifactVersionSchema.safeParse(version).success).toBe(true)
  })

  it("gives a substituted judge its own version", () => {
    const hosted = safetyJudgmentVersion({ provider: "amazon-bedrock", model: "anthropic.claude-haiku-4-5" })
    const selfHosted = safetyJudgmentVersion({ provider: "ollama", model: "llama-3.1-8b" })

    expect(hosted).not.toBe(selfHosted)
  })

  it("digests a judge identity too long for the persisted version column", () => {
    const version = safetyJudgmentVersion({ provider: "custom", model: "m".repeat(200) })
    const sibling = safetyJudgmentVersion({ provider: "custom", model: `${"m".repeat(199)}n` })

    expect(version.length).toBeLessThanOrEqual(FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH)
    expect(scoringArtifactVersionSchema.safeParse(version).success).toBe(true)
    expect(version).not.toBe(sibling)
  })

  it("does not share a version with the task-outcome judge on the same model", () => {
    expect(safetyJudgmentVersion(FLAGGER_DEFAULT_CLASSIFIER_MODEL)).not.toBe(
      taskOutcomeJudgmentVersion(FLAGGER_DEFAULT_CLASSIFIER_MODEL),
    )
  })
})
