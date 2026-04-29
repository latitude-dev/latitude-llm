import { readFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import ts from "typescript"

/**
 * Static safety scan for `ts-module` candidates (e.g. flagger strategies).
 *
 * The proposer is allowed to rewrite the strategy file freely; the scan
 * here is the workspace-trust boundary that runs at propose-time. A scan
 * failure rolls back into the propose retry loop with the failure reason
 * fed to the proposer, so the proposer can adapt rather than us
 * pre-enumerating every available import (which would bias the proposer
 * away from surfacing "I really wish I had X" via `reasoning`).
 *
 * Rules — see `specs/ai-benchmark-optimizer.md` §"Static-scan rules":
 *
 * 1. File parses as valid TypeScript (no syntax errors).
 * 2. Every import resolves from the strategy file's package context:
 *    - workspace modules listed in the package's `package.json` deps
 *      (e.g. `@domain/spans`, `@repo/utils`, `effect`, `zod`)
 *    - relative paths that stay inside the strategy directory
 *    - npm packages declared in `dependencies` of the package
 * 3. Architectural denylist — `@platform/*`, `@apps/*`, `node:*` (the
 *    dangerous Node builtins are a strict subset of `node:*` and are
 *    rejected wholesale here for simplicity; the strategy file has no
 *    legitimate need for any node builtin).
 * 4. Dangerous-intrinsic denylist by name regardless of import source:
 *    `process.*` reads/writes, `globalThis.*` writes, `eval(...)`,
 *    `Function(...)` constructor, `require(...)`, dynamic `import(...)`.
 * 5. Export shape: must export `<exportName>` declared as a plain object
 *    literal containing the four method names: `hasRequiredContext`,
 *    `detectDeterministically`, `buildSystemPrompt`, `buildPrompt`.
 *    Runtime probe (in candidate-loader) verifies they're actually
 *    functions; the static probe just confirms the names appear.
 */

export interface PackageContext {
  readonly packageRoot: string
  readonly strategyFilePath: string
  readonly allowedSpecifiers: ReadonlySet<string>
}

export interface ScanReject {
  readonly ok: false
  readonly stage: "static-scan"
  readonly reason: string
}

interface ScanAccept {
  readonly ok: true
  readonly imports: readonly string[]
}

type ScanResult = ScanAccept | ScanReject

const FORBIDDEN_PREFIXES = ["@platform/", "@apps/", "node:"]

const DANGEROUS_BARE_CALLS = new Set(["eval", "require", "Function"])

const DANGEROUS_GLOBAL_ROOTS = new Set(["process", "globalThis", "Deno", "Bun"])

const REQUIRED_METHOD_NAMES = ["hasRequiredContext", "detectDeterministically", "buildSystemPrompt", "buildPrompt"]

/**
 * Build an allowlist of import top-level specifiers from the strategy
 * package's `package.json`. We accept anything in `dependencies` (the
 * candidate's runtime context); workspace deps are listed there with
 * `workspace:*` so they qualify too. `peerDependencies` and
 * `devDependencies` are deliberately excluded — strategies don't run with
 * dev deps available.
 */
export const loadPackageContext = async (input: {
  readonly strategyFilePath: string
  readonly packageJsonPath: string
}): Promise<PackageContext> => {
  const raw = await readFile(input.packageJsonPath, "utf8")
  const parsed = JSON.parse(raw) as {
    readonly dependencies?: Record<string, string>
  }
  const deps = parsed.dependencies ?? {}
  return {
    packageRoot: dirname(input.packageJsonPath),
    strategyFilePath: input.strategyFilePath,
    allowedSpecifiers: new Set(Object.keys(deps)),
  }
}

const topLevelSpecifier = (specifier: string): string => {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/")
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
  }
  return specifier.split("/")[0] ?? specifier
}

const isRelative = (specifier: string): boolean => specifier.startsWith(".") && !specifier.startsWith("./node_modules")

const isStrategyDirectorySafe = (specifier: string, strategyFilePath: string): boolean => {
  const strategyDir = dirname(strategyFilePath)
  const resolved = resolve(strategyDir, specifier)
  const rel = relative(strategyDir, resolved)
  // Reject anything escaping the strategy directory.
  return !rel.startsWith("..") && !rel.startsWith("/")
}

const checkSpecifier = (specifier: string, ctx: PackageContext): ScanReject | null => {
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (specifier === prefix.slice(0, -1) || specifier.startsWith(prefix)) {
      return {
        ok: false,
        stage: "static-scan",
        reason: `Import "${specifier}" is on the architectural denylist (forbidden prefix "${prefix}"). The strategy file may not depend on infrastructure adapters or node builtins.`,
      }
    }
  }
  if (isRelative(specifier)) {
    if (!isStrategyDirectorySafe(specifier, ctx.strategyFilePath)) {
      return {
        ok: false,
        stage: "static-scan",
        reason: `Relative import "${specifier}" escapes the strategy directory. Relative imports must stay inside the flagger-strategies folder.`,
      }
    }
    return null
  }
  const top = topLevelSpecifier(specifier)
  if (!ctx.allowedSpecifiers.has(top)) {
    return {
      ok: false,
      stage: "static-scan",
      reason: `Import "${specifier}" does not resolve from the strategy package context. Allowed specifiers: ${[...ctx.allowedSpecifiers].sort().join(", ")}. To add a new dependency the operator must install it manually and re-run the optimizer.`,
    }
  }
  return null
}

interface CollectedNode {
  readonly imports: readonly string[]
  readonly violations: readonly string[]
  readonly exportObjectMembers: readonly string[] | null
  readonly hasExport: boolean
}

const collectFromSource = (source: ts.SourceFile, exportName: string): CollectedNode => {
  const imports: string[] = []
  const violations: string[] = []
  let exportObjectMembers: readonly string[] | null = null
  let hasExport = false

  const recordViolation = (msg: string, node: ts.Node) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source))
    violations.push(`${msg} at line ${line + 1}:${character + 1}`)
  }

  const inspectExportedObject = (initializer: ts.Expression) => {
    if (!ts.isObjectLiteralExpression(initializer)) {
      exportObjectMembers = null
      return
    }
    const names: string[] = []
    for (const member of initializer.properties) {
      const name = member.name
      if (name === undefined) continue
      if (ts.isIdentifier(name)) names.push(name.text)
      else if (ts.isStringLiteral(name)) names.push(name.text)
    }
    exportObjectMembers = names
  }

  const visitTopLevel = (statement: ts.Statement) => {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      imports.push(statement.moduleSpecifier.text)
      return
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      // export { foo } from "..."
      imports.push(statement.moduleSpecifier.text)
    }
    if (ts.isVariableStatement(statement)) {
      const isExported = (statement.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      if (!isExported) return
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === exportName) {
          hasExport = true
          if (decl.initializer) inspectExportedObject(decl.initializer)
        }
      }
    }
  }

  const visitDeep = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (ts.isIdentifier(callee) && DANGEROUS_BARE_CALLS.has(callee.text)) {
        recordViolation(`forbidden call to ${callee.text}(...)`, node)
      } else if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        recordViolation("forbidden dynamic import(...)", node)
      } else if (ts.isIdentifier(callee) && callee.text === "Function") {
        recordViolation("forbidden Function(...) constructor", node)
      }
    }
    if (ts.isNewExpression(node)) {
      const callee = node.expression
      if (ts.isIdentifier(callee) && callee.text === "Function") {
        recordViolation("forbidden new Function(...) constructor", node)
      }
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      // Walk to the leftmost identifier; if it's a denied global root, reject.
      let cur: ts.Expression = node
      while (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
        cur = cur.expression
      }
      if (ts.isIdentifier(cur) && DANGEROUS_GLOBAL_ROOTS.has(cur.text)) {
        recordViolation(`forbidden access to ${cur.text}.*`, node)
      }
    }
    ts.forEachChild(node, visitDeep)
  }

  for (const stmt of source.statements) {
    visitTopLevel(stmt)
  }
  visitDeep(source)

  return { imports, violations, exportObjectMembers, hasExport }
}

export const runStaticSafetyScan = (input: {
  readonly source: string
  readonly exportName: string
  readonly context: PackageContext
}): ScanResult => {
  let sourceFile: ts.SourceFile
  try {
    sourceFile = ts.createSourceFile("candidate.ts", input.source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
  } catch (err) {
    return {
      ok: false,
      stage: "static-scan",
      reason: `TypeScript parse failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // ts.createSourceFile collects parse diagnostics on the SourceFile object.
  const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []
  const first = parseDiagnostics[0]
  if (first !== undefined) {
    const msg = ts.flattenDiagnosticMessageText(first.messageText, "\n")
    return {
      ok: false,
      stage: "static-scan",
      reason: `TypeScript parse error: ${msg}`,
    }
  }

  const collected = collectFromSource(sourceFile, input.exportName)

  if (collected.violations.length > 0) {
    return {
      ok: false,
      stage: "static-scan",
      reason: `Dangerous-intrinsic violations: ${collected.violations.join("; ")}`,
    }
  }

  for (const specifier of collected.imports) {
    const reject = checkSpecifier(specifier, input.context)
    if (reject) return reject
  }

  if (!collected.hasExport) {
    return {
      ok: false,
      stage: "static-scan",
      reason: `Required export "${input.exportName}" not found. The strategy file must export const ${input.exportName}: FlaggerStrategy = { ... }.`,
    }
  }

  if (collected.exportObjectMembers === null) {
    return {
      ok: false,
      stage: "static-scan",
      reason: `Export "${input.exportName}" is not a plain object literal. The optimizer requires the strategy to be defined as an object literal so its method shape can be probed statically.`,
    }
  }

  const memberSet = new Set(collected.exportObjectMembers)
  const missing = REQUIRED_METHOD_NAMES.filter((m) => !memberSet.has(m))
  if (missing.length > 0) {
    return {
      ok: false,
      stage: "static-scan",
      reason: `Export "${input.exportName}" is missing required methods: ${missing.join(", ")}. All four FlaggerStrategy methods (${REQUIRED_METHOD_NAMES.join(", ")}) must be present.`,
    }
  }

  return { ok: true, imports: collected.imports }
}

/**
 * Catastrophic-backtracking sniff. Called from candidate-loader.ts as part
 * of the static-scan stage; a non-empty return value throws
 * CandidateLoadFailure({ stage: "static-scan", reason }), which the
 * evaluate callback turns into a `phase: "candidate-rejected"` trajectory
 * with the reason in feedback. The proposer reads that on the next
 * iteration via `chooseProposeContext` and learns to avoid the pattern.
 *
 * It used to be a soft TUI warning, but candidate-loader.ts documents that
 * the per-method 5s `Promise.race` timeout cannot interrupt sync regex
 * hangs — a pathological pattern from the proposer blocks the entire
 * event loop and freezes the evaluate pass — so we must catch these
 * statically before any strategy method runs.
 *
 * v1: simple text-level heuristic for nested unbounded quantifiers like
 * `(a+)+`, `(.*)*`, `(.+)*`. Misses some pathological patterns but catches
 * the common ones cheaply. Tradeoff: the heuristic is also conservative
 * enough that a benign nested-quantifier construct will be rejected
 * unnecessarily on rare candidates; acceptable because the proposer sees
 * the rejection feedback and adapts on the next iteration.
 */
export const sniffRegexDosRisk = (source: string): readonly string[] => {
  const warnings: string[] = []
  const nestedQuant = /\([^)]{0,200}[+*]\)\s*[+*]/g
  let match: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: classic regex iteration
  while ((match = nestedQuant.exec(source)) !== null) {
    warnings.push(`possibly-pathological regex pattern near "${match[0].slice(0, 40)}"`)
  }
  return warnings
}
