export const traceIdsSignature = (traceIds: readonly string[]): string => [...traceIds].sort().join(",")
