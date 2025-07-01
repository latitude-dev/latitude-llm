import type { CompileError } from 'promptl-ai'

export type AstError = {
  startIndex: CompileError['startIndex']
  endIndex: CompileError['endIndex']
  start: CompileError['start']
  end: CompileError['end']
  message: CompileError['message']
  name: CompileError['name']
}
