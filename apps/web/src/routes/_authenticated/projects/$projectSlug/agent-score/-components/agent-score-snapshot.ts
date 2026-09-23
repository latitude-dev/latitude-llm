import type { AgentScoreRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatScore, formatTotalScore, SCORE_DIMENSION_ORDER } from "./agent-score-format.ts"

export interface ScoreSnapshotInput {
  readonly snapshot: AgentScoreRecord
  readonly projectSlug: string
}

export interface ScoreSnapshotImage {
  readonly blob: Blob
  readonly previewUrl: string
  readonly filename: string
}

const IMAGE_SIZE = 1270
const IMAGE_SCALE = 2
const ASSET_PATH = "/agent-score-snapshot"
const DIMENSION_LABELS = {
  outcome: "Outcome",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  safety: "Safety",
}
const SNAPSHOT_PALETTES = {
  blue: { fill: "#0080ff" },
  green: { fill: "#53cc66" },
  red: { fill: "#f0543c" },
} as const

const snapshotBand = (score: number): keyof typeof SNAPSHOT_PALETTES =>
  score < 60 ? "red" : score < 80 ? "blue" : "green"

async function loadImage(filename: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = `${ASSET_PATH}/${filename}`
  await image.decode()
  return image
}

let fontsReady: Promise<void> | undefined
function loadFonts(): Promise<void> {
  fontsReady ??= Promise.all([
    new FontFace("Snapshot Display", `url(${ASSET_PATH}/InterDisplay-Bold.woff2)`, { weight: "700" }).load(),
    new FontFace("Snapshot Labels", `url(${ASSET_PATH}/Inter-SemiBold.woff2)`, { weight: "600" }).load(),
  ])
    .then((fonts) => {
      for (const font of fonts) document.fonts.add(font)
    })
    .catch((error: unknown) => {
      fontsReady = undefined
      throw error
    })
  return fontsReady
}

function fillCircle(context: CanvasRenderingContext2D, radius: number) {
  context.beginPath()
  context.arc(0, 0, radius, 0, Math.PI * 2)
  context.fill()
}

function drawScoreDisc({
  context,
  x,
  y,
  size,
  score,
  total = false,
}: {
  context: CanvasRenderingContext2D
  x: number
  y: number
  size: number
  score: number | null
  total?: boolean
}) {
  const scale = size / 460.724
  const radius = 184.167
  context.save()
  context.translate(x + size / 2, y + size / 2)
  context.scale(scale, scale)
  context.fillStyle = "#f9fafb"
  for (const [offset, blur, opacity] of [
    [201.567, 40.793, 0.01],
    [115.181, 34.794, 0.05],
    [50.392, 25.196, 0.09],
    [11.998, 14.398, 0.1],
  ] as const) {
    context.shadowOffsetY = offset * scale * IMAGE_SCALE
    context.shadowBlur = blur * scale * IMAGE_SCALE
    context.shadowColor = `rgba(0, 0, 0, ${opacity})`
    fillCircle(context, 230.362)
  }
  context.shadowColor = "transparent"
  if (score !== null) {
    const palette = SNAPSHOT_PALETTES[snapshotBand(score)]
    context.fillStyle = palette.fill
    context.globalAlpha = 0.1
    fillCircle(context, 169.167)
    context.globalAlpha = 1
    const start = Math.PI / 36
    const sweep = (Math.max(0, Math.min(100, score)) / 100) * Math.PI * 2
    if (sweep > 0) {
      context.strokeStyle = palette.fill
      context.lineWidth = 30
      context.lineCap = "round"
      context.beginPath()
      context.arc(0, 0, radius, start, start + sweep)
      context.stroke()
    }
  }
  context.font = '700 153.575px "Snapshot Display"'
  context.textAlign = "center"
  context.fillStyle = "#050506"
  context.globalAlpha = 0.8
  const label = score === null ? "—" : total ? formatTotalScore(score) : formatScore(score)
  const metrics = context.measureText(label)
  context.fillText(label, 0, (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2)
  context.restore()
}

export async function createScoreSnapshot(input: ScoreSnapshotInput): Promise<ScoreSnapshotImage> {
  const { snapshot } = input
  const [background, headline, wordmark, benchmark, logo] = await Promise.all([
    loadImage(`background-${snapshotBand(snapshot.score)}.png`),
    loadImage("headline.svg"),
    loadImage("wordmark.svg"),
    loadImage("benchmark.svg"),
    loadImage("logo.svg"),
    loadFonts(),
  ])
  const canvas = document.createElement("canvas")
  canvas.width = IMAGE_SIZE * IMAGE_SCALE
  canvas.height = IMAGE_SIZE * IMAGE_SCALE
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Image export is unavailable in this browser.")
  context.scale(IMAGE_SCALE, IMAGE_SCALE)
  context.drawImage(background, 0, 0, IMAGE_SIZE, IMAGE_SIZE)
  context.drawImage(headline, 149.977, 139.5, 970.047, 102.922)
  context.drawImage(wordmark, 1012.268, 620.56, 200.346, 30.04)
  context.drawImage(benchmark, 59.276, 621.04, 258.305, 36.72)
  context.save()
  context.translate(976, 637)
  context.rotate(-Math.PI / 2)
  context.drawImage(logo, -20, -20, 40, 40)
  context.restore()
  drawScoreDisc({ context, x: 384.276, y: 384.276, size: 500.724, score: snapshot.score, total: true })
  SCORE_DIMENSION_ORDER.forEach((dimension, index) => {
    const x = 122 + index * 220.176
    drawScoreDisc({ context, x, y: 992, size: 145.296, score: snapshot.dimensions[dimension]?.score ?? null })
    context.font = '600 24px "Snapshot Labels"'
    context.textAlign = "center"
    context.fillStyle = "#ffffff"
    context.fillText(DIMENSION_LABELS[dimension], x + 72.648, 1180.296)
  })
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Could not create the snapshot image."))),
      "image/png",
    ),
  )
  const slug = input.projectSlug.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "project"
  return { blob, previewUrl: canvas.toDataURL("image/png"), filename: `${slug}-agent-score-${snapshot.date}.png` }
}

export function downloadScoreSnapshot(image: ScoreSnapshotImage): void {
  const link = document.createElement("a")
  link.href = image.previewUrl
  link.download = image.filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}
