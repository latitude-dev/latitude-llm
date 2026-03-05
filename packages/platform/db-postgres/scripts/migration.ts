import { execSync } from "node:child_process"
import readline from "node:readline"

function ask(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise<string>((resolve) =>
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    }),
  )
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

async function main() {
  const modeArg = process.argv[2] // "auto" | "custom" | undefined
  const nameArg = process.argv[3] // optional name

  let mode = modeArg
  if (mode !== "auto" && mode !== "custom") {
    const m = await ask("Migration type ([a]uto / [c]ustom): ")
    mode = m.toLowerCase().startsWith("c") ? "custom" : "auto"
  }

  let name = nameArg ?? (await ask("Migration name: "))
  if (!name) {
    console.error("Migration name required")
    process.exit(1)
  }

  name = slugify(name)

  const customFlag = mode === "custom" ? "--custom " : ""
  const cmd = `drizzle-kit generate ${customFlag}--config=drizzle.config.ts --name ${name}`

  execSync(cmd, { stdio: "inherit" })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
