// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { createScoreSnapshot, downloadScoreSnapshot } from "./agent-score-snapshot.ts"
import { ScoreSnapshotButton } from "./score-snapshot-button.tsx"

vi.mock("./agent-score-snapshot.ts", () => ({ createScoreSnapshot: vi.fn(), downloadScoreSnapshot: vi.fn() }))

const snapshot: AgentScoreRecord = {
  date: "2026-09-12",
  createdAt: "2026-09-12T04:30:00Z",
  score: 76.8,
  interval: { lower: 70, upper: 80 },
  dimensions: {},
  scoringVersion: "test-v1",
  windowDays: 14,
  eligibleSessionCount: 1781,
  policyCap: null,
}
const image = {
  blob: new Blob(["png"], { type: "image/png" }),
  previewUrl: "data:image/png;base64,cG5n",
  filename: "support-agent-score-2026-09-12.png",
}
const write = vi.fn()

beforeEach(() => {
  vi.mocked(createScoreSnapshot).mockResolvedValue(image)
  write.mockResolvedValue(undefined)
  vi.stubGlobal(
    "ClipboardItem",
    class {
      constructor(readonly data: Record<string, Blob>) {}
    },
  )
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, "clipboard")
})

function renderButton(value: AgentScoreRecord | null = snapshot) {
  return render(<ScoreSnapshotButton snapshot={value} projectName="Support" projectSlug="support" />)
}

describe("ScoreSnapshotButton", () => {
  it("previews the selected day's image and copies and downloads that same PNG", async () => {
    renderButton()
    fireEvent.click(screen.getByRole("button", { name: "Create score snapshot" }))
    expect(screen.getByRole("dialog", { name: "Score snapshot" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Copy image" }).hasAttribute("disabled")).toBe(true)
    const preview = await screen.findByRole("img", { name: "Agent Score snapshot for Support" })
    expect(preview.getAttribute("src")).toBe(image.previewUrl)
    expect(createScoreSnapshot).toHaveBeenCalledWith({
      snapshot,
      projectSlug: "support",
    })
    fireEvent.click(screen.getByRole("button", { name: "Copy image" }))
    await waitFor(() => expect(write).toHaveBeenCalledOnce())
    expect(write.mock.calls[0]?.[0][0].data["image/png"]).toBe(image.blob)
    fireEvent.click(screen.getByRole("button", { name: "Download PNG" }))
    expect(downloadScoreSnapshot).toHaveBeenCalledExactlyOnceWith(image)
  })

  it("offers retry after generation fails", async () => {
    vi.mocked(createScoreSnapshot).mockRejectedValueOnce(new Error("Could not encode"))
    renderButton()
    fireEvent.click(screen.getByRole("button", { name: "Create score snapshot" }))
    await screen.findByText("Could not generate the snapshot.")
    expect(screen.getByRole("button", { name: "Download PNG" }).hasAttribute("disabled")).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await screen.findByRole("img")
    expect(createScoreSnapshot).toHaveBeenCalledTimes(2)
  })

  it("keeps download available when clipboard images are unsupported", async () => {
    vi.stubGlobal("ClipboardItem", undefined)
    renderButton()
    fireEvent.click(screen.getByRole("button", { name: "Create score snapshot" }))
    await screen.findByRole("img")
    expect(screen.getByRole("button", { name: "Copy image" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "Download PNG" }).hasAttribute("disabled")).toBe(false)
  })

  it("does not offer a snapshot for an unpublished date", () => {
    renderButton(null)
    expect(screen.getByRole("button", { name: "Create score snapshot" }).hasAttribute("disabled")).toBe(true)
    expect(createScoreSnapshot).not.toHaveBeenCalled()
  })
})
