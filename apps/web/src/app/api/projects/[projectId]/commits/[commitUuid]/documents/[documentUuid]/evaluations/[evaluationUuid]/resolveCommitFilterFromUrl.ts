import { CommitsRepository } from '@latitude-data/core/repositories'
import { EvaluationResultsV2Search } from '@latitude-data/core/helpers'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'

export async function resolveCommitFilterFromUrl({
  commitsRepository,
  commit,
  search,
}: {
  commitsRepository: CommitsRepository
  commit: Commit
  search: EvaluationResultsV2Search
}): Promise<EvaluationResultsV2Search> {
  if (search.filters?.commitUuids !== undefined) return search

  const commitUuids = commit.mergedAt
    ? (await commitsRepository.getCommitsHistory({ commit })).map((c) => c.uuid)
    : [commit.uuid]

  return {
    ...search,
    filters: {
      ...search.filters,
      commitUuids,
    },
  }
}
