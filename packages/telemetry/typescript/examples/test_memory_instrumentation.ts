/**
 * Memory-operation instrumentation — Latitude telemetry example.
 *
 * Emits OpenTelemetry GenAI memory spans (create_memory / search_memory / …) with
 * createMemoryTelemetry, so they classify on the Spans tab and, because captureContent
 * is opted in here, populate the Memory page (record bodies, diffs, token deltas).
 *
 * `store.id` groups everything — set it to a user id for per-user memory. Content capture
 * is OFF by default (OTEL Opt-In + PII); this example turns it on to show the full surface.
 *
 * Required env vars:
 * - LATITUDE_API_KEY
 * - LATITUDE_PROJECT_SLUG
 */

import { randomUUID } from "node:crypto"
import { capture, createMemoryTelemetry, Latitude } from "../src"

const latitude = new Latitude({
  apiKey: process.env.LATITUDE_API_KEY!,
  project: process.env.LATITUDE_PROJECT_SLUG!,
  disableBatch: true,
})

const SESSION_ID = `memory-${randomUUID().slice(0, 8)}`
const USER_ID = "example-user"

// Stand-in for a real memory provider (Mem0/Zep/etc.); returns the records it stored/found.
type Record = { id: string; content: string; score?: number }
const store = new Map<string, Record>()
const fakeStore = {
  add: async (record: Record) => {
    store.set(record.id, record)
    return record
  },
  search: async (query: string): Promise<Record[]> =>
    [...store.values()].filter((r) => r.content.includes(query)).map((r) => ({ ...r, score: 0.9 })),
}

async function memoryConversation() {
  // store.id = the user id → this user's memory is its own store.
  const memory = createMemoryTelemetry({
    latitude,
    storeId: USER_ID,
    captureContent: true,
  })

  // Wrap form: times the write, captures errors, and records the new body.
  await memory.create({
    recordId: "mem_pref_drink",
    records: [{ id: "mem_pref_drink", content: "Prefers tea over coffee" }],
    execute: () => fakeStore.add({ id: "mem_pref_drink", content: "Prefers tea over coffee" }),
  })

  // Search: the result maps to the records it returned (with scores) and sets the count.
  const hits = await memory.search({
    query: "tea",
    execute: () => fakeStore.search("tea"),
    recordsFromResult: (results) => results,
  })

  // Emit form: record an operation that already happened, no wrapping.
  await memory.update({
    recordId: "mem_pref_drink",
    records: [{ id: "mem_pref_drink", content: "Prefers green tea, no coffee" }],
  })

  return hits
}

async function main() {
  await latitude.ready

  const hits = await capture("memory-instrumentation", memoryConversation, {
    tags: ["example", "memory-instrumentation-ts"],
    sessionId: SESSION_ID,
    userId: USER_ID,
    metadata: { environment: "local" },
  })
  console.log(`Search hits: ${hits.length}`)
  console.log("Expected spans: create_memory, search_memory, update_memory (grouped under the capture root)")

  await latitude.flush()
  await latitude.shutdown()
}

main().catch(console.error)
