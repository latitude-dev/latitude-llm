import { describe, expect, it } from "vitest"
import { buildIssueRows, type IssueSession } from "./build-issue-rows.ts"

const session = (
  sessionId: string,
  adverse: boolean,
  observations: IssueSession["observations"],
  endpointInclusionProbability = 0.1,
): IssueSession => ({ sessionId, adverse, endpointInclusionProbability, observations })

const moment = { issueKey: "moment:correction", label: "Users corrected or abandoned", observationProbability: 1 }
const noOutput = { issueKey: "issue:no-output:blank", label: "No usable final output", observationProbability: 1 }

describe("buildIssueRows", () => {
  it("corrects reach and failed reach for the probability each was observed at", () => {
    const rows = buildIssueRows({
      sessions: [session("a", true, [moment]), session("b", true, [moment]), session("c", false, [moment])],
    })

    // The moment reader runs on everything, so reach is the raw count. Failure
    // is only known at the verdict's 10%, so each failure stands for ten.
    expect(rows[0]).toMatchObject({
      label: "Users corrected or abandoned",
      estimatedReach: 3,
      estimatedAdverseReach: 20,
      examinedSessions: 3,
      examinedAdverseSessions: 2,
      ranked: true,
    })
  })

  // A split cluster or several matching moments on one session would otherwise
  // make an issue look twice as widespread as it is.
  it("counts a session once per issue however many detectors saw it", () => {
    const rows = buildIssueRows({
      sessions: [session("a", true, [moment, { ...moment, label: "A second detector" }, noOutput])],
    })

    const momentRow = rows.find((row) => row.issueKey === moment.issueKey)
    expect(momentRow).toMatchObject({ examinedSessions: 1, estimatedReach: 1 })
    expect(rows).toHaveLength(2)
  })

  it("weights a sampled observation by its own probability", () => {
    const sampled = { issueKey: "signal:laziness", label: "Shallow answers", observationProbability: 0.2 }
    const rows = buildIssueRows({ sessions: [session("a", true, [sampled])] })

    expect(rows[0]!.estimatedReach).toBeCloseTo(5, 10)
    // Independent draws: seeing both the issue and the verdict is 0.2 * 0.1.
    expect(rows[0]!.estimatedAdverseReach).toBeCloseTo(50, 10)
  })

  // The signal was discovered from the verdict score, so the draw happened once.
  it("does not square a probability that was only rolled once", () => {
    const shared = {
      issueKey: "signal:refund-loop",
      label: "Refund-flow loop signal",
      observationProbability: 0.1,
      sharesEndpointSelection: true,
    }
    const rows = buildIssueRows({ sessions: [session("a", true, [shared])] })

    expect(rows[0]!.estimatedAdverseReach).toBeCloseTo(10, 10)
  })

  it("ranks by corrected failed reach, not by raw overlap", () => {
    const common = { issueKey: "common", label: "Seen often, rarely fatal", observationProbability: 1 }
    const rare = { issueKey: "rare", label: "Seen rarely, always fatal", observationProbability: 0.05 }

    const rows = buildIssueRows({
      sessions: [
        session("a", false, [common]),
        session("b", false, [common]),
        session("c", false, [common]),
        session("d", true, [common]),
        session("e", true, [rare]),
      ],
    })

    expect(rows.map((row) => row.issueKey)).toEqual(["rare", "common"])
    expect(rows[1]!.examinedSessions).toBeGreaterThan(rows[0]!.examinedSessions)
  })

  describe("when a joint probability is unknown", () => {
    const unknown = { issueKey: "unknown", label: "Reader with no recorded selection" }

    it("leaves the row unranked instead of guessing", () => {
      const rows = buildIssueRows({ sessions: [session("a", true, [unknown])] })

      expect(rows[0]).toMatchObject({ ranked: false, examinedAdverseSessions: 1 })
      expect(rows[0]!.estimatedAdverseReach).toBeUndefined()
    })

    // An uncorrected raw count is not a reach estimate: a reader sampling at
    // 10% would report a tenth of the sessions it stands for.
    it("reports no reach estimate either, rather than an uncorrected count", () => {
      const rows = buildIssueRows({
        sessions: [session("a", false, [unknown]), session("b", false, [unknown])],
      })

      expect(rows[0]).toMatchObject({ ranked: false, examinedSessions: 2 })
      expect(rows[0]!.estimatedReach).toBeUndefined()
    })

    it("drops the estimate for the whole issue when only some sessions lack a probability", () => {
      const rows = buildIssueRows({
        sessions: [session("a", false, [{ ...unknown, observationProbability: 1 }]), session("b", false, [unknown])],
      })

      expect(rows[0]!.estimatedReach).toBeUndefined()
      expect(rows[0]!.examinedSessions).toBe(2)
    })

    it("orders unranked rows by the raw count they do have", () => {
      const other = { issueKey: "other-unknown", label: "Another unrecorded reader" }
      const rows = buildIssueRows({
        sessions: [session("a", true, [unknown]), session("b", true, [unknown]), session("c", true, [other])],
      })

      expect(rows.map((row) => row.issueKey)).toEqual(["unknown", "other-unknown"])
    })

    it("still reports the issue, below the rows that earned a position", () => {
      const rows = buildIssueRows({
        sessions: [session("a", true, [unknown]), session("b", true, [moment])],
      })

      expect(rows.map((row) => row.issueKey)).toEqual(["moment:correction", "unknown"])
    })
  })

  it("bounds the list so the tail cannot crowd out the explanation", () => {
    const rows = buildIssueRows({
      sessions: Array.from({ length: 50 }, (_, index) =>
        session(`session-${index}`, true, [
          { issueKey: `issue-${index}`, label: `Issue ${index}`, observationProbability: 1 },
        ]),
      ),
      rowLimit: 5,
    })

    expect(rows).toHaveLength(5)
  })

  it("returns nothing when no session carried an issue", () => {
    expect(buildIssueRows({ sessions: [session("a", true, [])] })).toEqual([])
  })
})
