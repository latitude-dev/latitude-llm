import {
  LogSources,
  RUN_SOURCES,
  RunSourceGroup,
} from '@latitude-data/constants'

export function mapSourceGroupToLogSources(
  source?: RunSourceGroup,
): LogSources[] {
  return source !== undefined
    ? RUN_SOURCES[source]
    : (source ?? [LogSources.API, LogSources.Playground, LogSources.Experiment])
}
