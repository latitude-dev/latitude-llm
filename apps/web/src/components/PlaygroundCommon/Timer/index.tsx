import { LineSeparator } from '@latitude-data/web-ui/atoms/LineSeparator'

export function Timer({ timeMs }: { timeMs: number }) {
  return <LineSeparator text={`${(timeMs / 1_000).toFixed(2)} s`} />
}
