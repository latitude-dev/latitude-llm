import { Compiler } from './compiler'
import type {
  QueryMetadata,
  ResolveFn,
  SupportedMethod,
} from './compiler/types'

export type CompileParams = {
  query: string
  resolveFn: ResolveFn
  supportedMethods?: Record<string, SupportedMethod>
}

export function compile({
  query,
  supportedMethods,
  resolveFn,
}: CompileParams): Promise<string> {
  return new Compiler({
    sql: query,
    supportedMethods: supportedMethods || {},
    resolveFn,
  }).compileSQL()
}

export function readMetadata({
  query,
  supportedMethods,
}: {
  query: string
  supportedMethods?: Record<string, SupportedMethod>
}): Promise<QueryMetadata> {
  return new Compiler({
    sql: query,
    supportedMethods: supportedMethods || {},
    resolveFn: () => Promise.resolve(''),
  }).readMetadata()
}

export { default as CompileError } from './error/error'
export * from './compiler/types'
export * from './compiler/utils'
