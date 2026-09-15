import { type Job, UnrecoverableError } from "bullmq"
import { describe, expect, it } from "vitest"

import { failedJobContextFromJob } from "./worker-incidents.ts"

describe("failedJobContextFromJob", () => {
  it("returns undefined when job is undefined", () => {
    expect(failedJobContextFromJob(undefined)).toBeUndefined()
  })

  it("computes willRetry from attemptsMade vs configured attempts", () => {
    const job = {
      id: "j1",
      name: "my-task",
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as unknown as Job
    expect(failedJobContextFromJob(job)).toEqual({
      id: "j1",
      task: "my-task",
      attemptsMade: 1,
      attemptsConfigured: 3,
      willRetry: true,
    })
  })

  it("sets willRetry false on final attempt", () => {
    const job = {
      id: "j2",
      name: "t",
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as unknown as Job
    expect(failedJobContextFromJob(job)?.willRetry).toBe(false)
  })

  it("defaults attemptsConfigured to 1 when opts.attempts is missing", () => {
    const job = {
      id: "j3",
      name: "t",
      attemptsMade: 1,
      opts: {},
    } as unknown as Job
    const ctx = failedJobContextFromJob(job)
    expect(ctx?.attemptsConfigured).toBe(1)
    expect(ctx?.willRetry).toBe(false)
  })

  it("forces willRetry false on an UnrecoverableError even with attempts left", () => {
    const job = {
      id: "j4",
      name: "t",
      attemptsMade: 1,
      opts: { attempts: 10 },
    } as unknown as Job
    const ctx = failedJobContextFromJob(job, new UnrecoverableError("object never existed at this key"))
    expect(ctx?.willRetry).toBe(false)
  })

  it("still retries a non-UnrecoverableError with attempts left", () => {
    const job = {
      id: "j5",
      name: "t",
      attemptsMade: 1,
      opts: { attempts: 10 },
    } as unknown as Job
    expect(failedJobContextFromJob(job, new Error("timeout"))?.willRetry).toBe(true)
  })
})
