import type { PromptlSourceRef } from '@latitude-data/constants/legacyCompiler'

export type Reference = {
  identifier?: string
  content: string
  type: string
}
export type Segment = string | Reference

export function computeSegments(
  type: string,
  source: string | undefined,
  sourceMap: PromptlSourceRef[],
  parameters: string[],
): Segment[] {
  let segments: Segment[] = []
  if (!source) return segments

  // Filter source map references without value
  sourceMap = sourceMap.filter(
    (ref) => source.slice(ref.start, ref.end).trim().length > 0,
  )

  // Sort source map to ensure references are ordered
  sourceMap = sourceMap.sort((a, b) => a.start - b.start)

  const firstSegment = source.slice(0, sourceMap[0]?.start ?? source.length)
  if (firstSegment.length > 0) segments.push(firstSegment)

  for (let i = 0; i < sourceMap.length; i++) {
    segments.push({
      identifier:
        sourceMap[i]!.identifier &&
        parameters.includes(sourceMap[i]!.identifier!)
          ? sourceMap[i]!.identifier!
          : undefined,
      content: source.slice(sourceMap[i]!.start, sourceMap[i]!.end),
      type: type,
    })

    const nextSegment = source.slice(
      sourceMap[i]!.end,
      sourceMap[i + 1]?.start ?? source.length,
    )
    if (nextSegment.length > 0) segments.push(nextSegment)
  }

  return segments
}

export function groupSegments(segments: Segment[]) {
  let groups: Segment[][] = []
  let currentGroup: Segment[] = []

  for (const segment of segments) {
    if (typeof segment === 'string') {
      const subsegments = segment.split('\n')
      for (let i = 0; i < subsegments.length; i++) {
        if (subsegments[i]!.length > 0) currentGroup.push(subsegments[i]!)
        if (i < subsegments.length - 1) {
          groups.push(currentGroup)
          currentGroup = []
        }
      }
    } else {
      currentGroup.push(segment)
    }
  }

  if (currentGroup.length > 0) groups.push(currentGroup)

  return groups
}
