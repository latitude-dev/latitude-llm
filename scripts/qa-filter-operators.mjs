#!/usr/bin/env node
/**
 * QA harness for multi-select filter operators.
 * 1. Runs @domain/shared unit tests
 * 2. Records a short Playwright video of the operator tabs UX fixture
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const workspaceRoot = process.env.WORKSPACE_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const htmlPath = path.join(workspaceRoot, "artifacts/qa/filter-operator-qa.html")
const videoDir = path.join(workspaceRoot, "artifacts/qa/filter-operator-qa-video")
const webmOut = path.join(workspaceRoot, "artifacts/qa/filter-operator-qa.webm")
const mp4Out = path.join(workspaceRoot, "artifacts/qa/filter-operator-qa.mp4")

function runTests() {
  console.log("Running @domain/shared multi-select-filter tests…")
  const result = spawnSync(
    "pnpm",
    ["--filter", "@domain/shared", "test", "--", "multi-select-filter"],
    {
      cwd: workspaceRoot,
      stdio: "inherit",
      env: process.env,
    },
  )
  if (result.status !== 0) {
    throw new Error("Unit tests failed")
  }
  console.log("Unit tests passed.\n")
}

async function recordVideo() {
  const { chromium } = await import("playwright")
  fs.mkdirSync(videoDir, { recursive: true })

  console.log("Recording QA video…")
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  })
  const page = await context.newPage()
  await page.goto(`file://${htmlPath}`)
  await page.waitForTimeout(600)

  async function moveTo(locator) {
    const box = await locator.boundingBox()
    if (box) {
      await page.evaluate(
        ({ x, y }) => window.demoMoveCursor(x, y),
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      )
    }
  }

  const noneTab = page.getByRole("tab", { name: "None of" })
  const allTab = page.getByRole("tab", { name: "All of" })
  const anyTab = page.getByRole("tab", { name: "Any of" })
  const json = page.locator("#filter-json")

  await moveTo(anyTab)
  await page.waitForTimeout(400)

  // Switch to None of — filter JSON should show notIn
  await noneTab.click()
  await page.waitForTimeout(900)
  await expectJson(json, /"notIn"/)

  // Switch to All of — multiple eq conditions
  await allTab.click()
  await page.waitForTimeout(900)
  await expectJson(json, /"eq"/)

  // Add second tag while on All of
  await page.evaluate(() => window.demoAddChip("prod"))
  await page.waitForTimeout(700)
  await expectJson(json, /prod/)

  // Back to Any of
  await anyTab.click()
  await page.waitForTimeout(900)
  await expectJson(json, /"in"/)

  await page.waitForTimeout(500)
  await context.close()
  await browser.close()

  const webmFile = fs.readdirSync(videoDir).find((f) => f.endsWith(".webm"))
  if (!webmFile) throw new Error("No webm produced")
  fs.copyFileSync(path.join(videoDir, webmFile), webmOut)

  const ffmpeg = spawnSync(
    "ffmpeg",
    ["-y", "-i", webmOut, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4Out],
    { stdio: "pipe" },
  )
  if (ffmpeg.status !== 0) {
    console.warn("ffmpeg conversion failed; webm available at", webmOut)
    return webmOut
  }
  console.log(`QA video: ${mp4Out}`)
  return mp4Out
}

async function expectJson(locator, pattern) {
  const text = await locator.textContent()
  if (!text || !pattern.test(text)) {
    throw new Error(`JSON assertion failed for ${pattern}: ${text}`)
  }
}

try {
  runTests()
  const videoPath = await recordVideo()
  console.log("\nQA complete.")
  console.log(videoPath)
} catch (error) {
  console.error("QA failed:", error)
  process.exit(1)
}
