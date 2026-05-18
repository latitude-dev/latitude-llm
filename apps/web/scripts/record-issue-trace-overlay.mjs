#!/usr/bin/env node
/**
 * Records a short Playwright video: Mailpit magic-link sign-in as owner@acme.com,
 * then Issues → open first issue → open first trace (slide-over overlay) → Escape to close.
 *
 * Prerequisites
 * - Postgres seeded (`pnpm seed` from repo root) so Acme + issues + traces exist.
 * - Web on BASE_URL (default http://127.0.0.1:3000), API reachable from the browser.
 * - Workers running so magic-link email is delivered to Mailpit (default http://127.0.0.1:8025).
 * - Turnstile unset in `.env.development` (no `VITE_LAT_TURNSTILE_SITE_KEY`) so login form has no captcha.
 * - After install, download Chromium once: `pnpm --filter @app/web exec playwright install chromium`
 *
 * Usage (repo root):
 *   OUTPUT_VIDEO=/path/to/out.webm pnpm --filter @app/web record:issue-trace
 */

import { copyFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname } from "node:path"

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000"
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025"
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "owner@acme.com"
const PROJECT_SLUG = process.env.PROJECT_SLUG ?? "default-project"
const OUTPUT_VIDEO =
  process.env.OUTPUT_VIDEO ?? "/opt/cursor/artifacts/issue-trace-overlay.webm"

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.json()
}

/**
 * @param {string} toEmail
 * @param {number} notBeforeMs
 */
async function waitForMagicLinkUrl(toEmail, notBeforeMs) {
  const deadline = Date.now() + 120_000
  const needle = toEmail.toLowerCase()
  while (Date.now() < deadline) {
    const list = await fetchJson(`${MAILPIT_URL}/api/v1/messages?limit=30`)
    const rows = list.messages ?? []
    for (const row of rows) {
      const created = new Date(row.Created ?? row.created ?? 0).getTime()
      if (created < notBeforeMs - 2000) continue
      const to = (row.To ?? [])
        .map((/** @type {{ Address?: string }} */ t) => (t.Address ?? "").toLowerCase())
        .join(",")
      if (!to.includes(needle)) continue

      const id = row.ID ?? row.id
      const detail = await fetchJson(`${MAILPIT_URL}/api/v1/message/${id}`)
      const text = detail.Text ?? ""
      const match = text.match(/(https?:\/\/[^\s]+\/api\/auth\/magic-link\/verify[^\s]*)/)
      if (match?.[1]) return match[1]
    }
    await sleep(500)
  }
  throw new Error("Timed out waiting for magic link email in Mailpit")
}

async function main() {
  const { chromium } = await import("playwright")

  const outDir = dirname(OUTPUT_VIDEO)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PW_CHROME_PATH || undefined,
  })

  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: outDir },
  })
  const page = await context.newPage()

  const magicRequestedAt = Date.now()

  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 })
  await page.locator("#email").fill(OWNER_EMAIL)
  await page.getByRole("button", { name: "Continue with email" }).click()
  await page.getByText("Check your email").waitFor({ timeout: 30_000 })

  const magicUrl = await waitForMagicLinkUrl(OWNER_EMAIL, magicRequestedAt)
  await page.goto(magicUrl, { waitUntil: "domcontentloaded", timeout: 60_000 })

  await page.goto(`/projects/${PROJECT_SLUG}/issues`, { waitUntil: "domcontentloaded", timeout: 60_000 })
  await page.getByRole("button", { name: /^Open / }).first().click({ timeout: 30_000 })

  await page.getByText("Traces", { exact: true }).waitFor({ timeout: 30_000 })
  await page.getByRole("button", { name: /^Open trace / }).first().click({ timeout: 30_000 })
  await page.getByRole("tab", { name: "Conversation" }).waitFor({ state: "visible", timeout: 30_000 })
  await sleep(1500)

  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: /^Open trace / }).first().waitFor({ state: "visible", timeout: 15_000 })

  const vid = page.video()
  await context.close()
  const rawPath = await vid.path()
  await browser.close()

  copyFileSync(rawPath, OUTPUT_VIDEO)
  console.log(`Wrote ${OUTPUT_VIDEO}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
