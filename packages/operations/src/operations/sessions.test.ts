import { describe, expect, it } from "vitest"
import { sessionsModule } from "./sessions.ts"

describe("session assessment operation", () => {
  it("is declared read-only across public and agent-tool surfaces", () => {
    const operation = sessionsModule.operations.find((candidate) => candidate.route.name === "getSessionAssessment")

    expect(operation).toMatchObject({ access: "read-only", tool: true })
  })
})
