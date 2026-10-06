// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createScoreSnapshot, downloadScoreSnapshot, type ScoreSnapshotInput } from "./agent-score-snapshot.ts"

const interval = { lower: 60, upper: 90 }
const input: ScoreSnapshotInput = {
  projectSlug: "support",
  snapshot: {
    date: "2026-09-12",
    createdAt: "2026-09-12T04:30:00Z",
    score: 76.8,
    interval,
    dimensions: {
      outcome: { score: 83.4, interval },
      reliability: { score: 57.4, interval },
      cost: { score: 86, interval },
      speed: { score: 87, interval },
      safety: { score: 71, interval },
    },
    scoringVersion: "test-v1",
    windowDays: 14,
    eligibleSessionCount: 1781,
    policyCap: null,
  },
}

const drawImage = vi.fn()
const fillText = vi.fn()
const decode = vi.fn()
const blob = new Blob(["png"], { type: "image/png" })

beforeEach(() => {
  decode.mockResolvedValue(undefined)
  vi.stubGlobal(
    "Image",
    class {
      src = ""
      decode = decode
    },
  )
  vi.stubGlobal(
    "FontFace",
    class {
      load = vi.fn().mockResolvedValue(this)
    },
  )
  Object.defineProperty(document, "fonts", { configurable: true, value: { add: vi.fn() } })
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
    fillText,
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    measureText: () => ({ actualBoundingBoxAscent: 100, actualBoundingBoxDescent: 0 }),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(blob))
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,cG5n")
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, "fonts")
})

describe("score snapshot image", () => {
  it("exports the selected scores as a square PNG with blue replacing the middle band", async () => {
    const result = await createScoreSnapshot(input)
    expect(result.blob).toBe(blob)
    expect(drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ src: "/agent-score-snapshot/background-blue.png" }),
      0,
      0,
      1270,
      1270,
    )
    expect(fillText.mock.calls.map(([text]) => text)).toEqual([
      "76",
      "83",
      "Outcome",
      "57",
      "Reliability",
      "86",
      "Cost",
      "87",
      "Speed",
      "71",
      "Safety",
    ])
    const canvas = vi.mocked(HTMLCanvasElement.prototype.toBlob).mock.contexts[0]
    expect(canvas).toMatchObject({ width: 2540, height: 2540 })
  })

  it.each([
    [59, "red"],
    [60, "blue"],
    [79.9, "blue"],
    [80, "green"],
  ])("uses the correct background for score %s", async (score, band) => {
    await createScoreSnapshot({ ...input, snapshot: { ...input.snapshot, score: Number(score) } })
    expect(drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ src: `/agent-score-snapshot/background-${band}.png` }),
      0,
      0,
      1270,
      1270,
    )
  })

  it("shows an unavailable dimension as a dash instead of a zero score", async () => {
    await createScoreSnapshot({ ...input, snapshot: { ...input.snapshot, dimensions: {} } })
    expect(fillText.mock.calls.filter(([text]) => text === "—")).toHaveLength(5)
  })

  it("uses a safe filename and downloads the exact preview PNG", async () => {
    const result = await createScoreSnapshot({ ...input, projectSlug: "support/../agent" })
    expect(result.filename).toBe("support----agent-agent-score-2026-09-12.png")
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe(result.filename)
      expect(this.href).toBe(result.previewUrl)
    })
    downloadScoreSnapshot(result)
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector("a[download]")).toBeNull()
  })

  it("rejects failed asset loads so the modal can offer a retry", async () => {
    decode.mockRejectedValueOnce(new Error("Asset unavailable"))
    await expect(createScoreSnapshot(input)).rejects.toThrow("Asset unavailable")
    expect(drawImage).not.toHaveBeenCalled()
  })

  it("rejects failed PNG encoding", async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(null))
    await expect(createScoreSnapshot(input)).rejects.toThrow("Could not create the snapshot image.")
  })
})
