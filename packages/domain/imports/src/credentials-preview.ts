import type { ImportCredentials } from "./entities/import-source.ts"

const maskSecret = (value: string, prefix = 4, suffix = 4): string =>
  value.length <= prefix + suffix ? "…" : `${value.slice(0, prefix)}…${value.slice(-suffix)}`

export const previewCredentials = (credentials: ImportCredentials): string => {
  const key = credentials.kind === "langfuse" ? credentials.publicKey : credentials.apiKey
  return `${credentials.region} · ${maskSecret(key)}`
}
