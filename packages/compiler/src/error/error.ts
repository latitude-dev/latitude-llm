import { locate } from 'locate-character'

export interface Position {
  line: number
  column: number
}

type CompileErrorProps = {
  name: string
  code: string
  source: string
  start: number
  end?: number
}

export default class CompileError extends Error {
  code?: string
  start?: Position
  end?: Position
  pos?: number
  frame?: string

  toString() {
    if (!this.start) return this.message
    return `${this.message} (${this.start.line}:${this.start.column})\n${this.frame}`
  }
}

function tabsToSpaces(str: string) {
  return str.replace(/^\t+/, (match) => match.split('\t').join('  '))
}

function getCodeFrame(
  source: string,
  line: number,
  startColumn: number,
  endColumn: number | undefined,
): string {
  const lines = source.split('\n')
  const frameStart = Math.max(0, line - 2)
  const frameEnd = Math.min(line + 3, lines.length)
  const digits = String(frameEnd + 1).length
  return lines
    .slice(frameStart, frameEnd)
    .map((str, i) => {
      const isErrorLine = frameStart + i === line
      const lineNum = String(i + frameStart + 1).padStart(digits, ' ')
      if (isErrorLine) {
        const indicator =
          ' '.repeat(
            digits + 2 + tabsToSpaces(str.slice(0, startColumn)).length,
          ) +
          '^' +
          '~'.repeat(endColumn ? Math.max(0, endColumn - startColumn - 1) : 0)
        return `${lineNum}: ${tabsToSpaces(str)}\n\n${indicator}`
      }
      return `${lineNum}: ${tabsToSpaces(str)}`
    })
    .join('\n')
}

export function error(message: string, props: CompileErrorProps): never {
  const error = new CompileError(message)
  error.name = props.name
  const start = locate(props.source, props.start, { offsetLine: 1 })
  const end = locate(props.source, props.end || props.start, { offsetLine: 1 })
  error.code = props.code
  error.start = start
  error.end = end
  error.pos = props.start
  error.frame = getCodeFrame(
    props.source,
    (start?.line ?? 1) - 1,
    start?.column ?? 0,
    end?.column,
  )
  throw error
}
