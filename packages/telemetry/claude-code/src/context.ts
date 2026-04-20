import { execFileSync } from "node:child_process"
import { basename } from "node:path"
import type { HookPayload, TraceContext } from "./types.ts"

const GIT_TIMEOUT_MS = 1_500
const CLAUDE_VERSION_TIMEOUT_MS = 2_000

export function collectTraceContext(payload: HookPayload): TraceContext {
  const cwd = payload.cwd?.trim() || undefined
  const workspaceName = cwd ? basename(cwd) : undefined
  const workspacePath = cwd

  const git = cwd ? readGit(cwd) : {}
  const claudeCodeVersion = readClaudeCodeVersion()
  const hostUser = readHostUser()
  const hookEvent = payload.hook_event_name ?? payload.hookEventName

  const metadata: Record<string, string> = {}
  if (workspaceName) metadata["workspace.name"] = workspaceName
  if (workspacePath) metadata["workspace.path"] = workspacePath
  if (git.branch) metadata["git.branch"] = git.branch
  if (git.commit) metadata["git.commit"] = git.commit
  if (git.repo) metadata["git.repo"] = git.repo
  if (claudeCodeVersion) metadata["claude_code.version"] = claudeCodeVersion
  if (hostUser) metadata["host.user"] = hostUser
  if (hookEvent) metadata["hook.event"] = hookEvent

  const tags: string[] = []
  if (workspaceName) tags.push(workspaceName)

  return { tags, metadata }
}

interface GitInfo {
  branch?: string | undefined
  commit?: string | undefined
  repo?: string | undefined
}

function readGit(cwd: string): GitInfo {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
  const commit = runGit(["rev-parse", "HEAD"], cwd)
  const remote = runGit(["config", "--get", "remote.origin.url"], cwd)
  const repo = remote ? deriveRepo(remote) : undefined
  return {
    branch: branch && branch !== "HEAD" ? branch : undefined,
    commit,
    repo,
  }
}

function runGit(args: string[], cwd: string): string | undefined {
  try {
    const out = execFileSync("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
    })
    const trimmed = out.trim()
    return trimmed || undefined
  } catch {
    return undefined
  }
}

function deriveRepo(remote: string): string | undefined {
  // normalize "git@github.com:owner/repo.git" and "https://github.com/owner/repo[.git]" → "owner/repo"
  const stripped = remote.replace(/\.git$/, "").trim()
  const sshMatch = stripped.match(/^[^@]+@[^:]+:(.+)$/)
  if (sshMatch?.[1]) return sshMatch[1]
  try {
    const url = new URL(stripped)
    const path = url.pathname.replace(/^\/+/, "")
    return path || undefined
  } catch {
    return stripped || undefined
  }
}

function readClaudeCodeVersion(): string | undefined {
  try {
    const out = execFileSync("claude", ["--version"], {
      timeout: CLAUDE_VERSION_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
    })
    const match = out.match(/\d+\.\d+\.\d+[^\s]*/)
    return match?.[0]
  } catch {
    return undefined
  }
}

function readHostUser(): string | undefined {
  return process.env.USER || process.env.LOGNAME || process.env.USERNAME || undefined
}
