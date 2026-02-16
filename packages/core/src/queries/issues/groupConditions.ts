import {
  ESCALATION_EXPIRATION_DAYS,
  HISTOGRAM_SUBQUERY_ALIAS,
  ISSUE_GROUP,
  IssueGroup,
} from '@latitude-data/constants/issues'
import { and, isNotNull, isNull, or, sql, SQL } from 'drizzle-orm'

import { issues } from '../../schema/models/issues'

function withMergedIssues(include: boolean): SQL {
  return include ? isNotNull(issues.mergedAt) : isNull(issues.mergedAt)
}

function withRegressedIssues(include: boolean): SQL {
  return include
    ? sql`${issues.resolvedAt} IS NOT NULL AND ${issues.ignoredAt} IS NULL AND ${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate"`)} > ${issues.resolvedAt}`
    : sql`${issues.resolvedAt} IS NULL OR ${issues.ignoredAt} IS NOT NULL OR ${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate"`)} <= ${issues.resolvedAt}`
}

function withResolvedIssues(include: boolean): SQL {
  return include ? isNotNull(issues.resolvedAt) : isNull(issues.resolvedAt)
}

function withIgnoredIssues(include: boolean): SQL {
  return include ? isNotNull(issues.ignoredAt) : isNull(issues.ignoredAt)
}

export function buildGroupConditions(
  group: IssueGroup = ISSUE_GROUP.active,
): SQL | undefined {
  switch (group) {
    case 'active':
      return and(
        or(
          and(withResolvedIssues(false), withIgnoredIssues(false)),
          withRegressedIssues(true),
        ),
        withMergedIssues(false),
      )!
    case 'inactive':
      return or(
        withIgnoredIssues(true),
        sql`(${issues.resolvedAt} IS NOT NULL AND ${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate"`)} <= ${issues.resolvedAt})`,
        withMergedIssues(true),
      )!
    case 'activeWithResolved':
      return and(
        or(
          and(withResolvedIssues(false), withIgnoredIssues(false)),
          withResolvedIssues(true),
        ),
        withIgnoredIssues(false),
        withMergedIssues(false),
      )!
  }
}

export function issuesWithStatsSelect({
  subquery,
}: {
  subquery: {
    recentCount: any
    totalCount: any
    firstSeenDate: any
    firstOccurredAt: any
    lastSeenDate: any
    lastOccurredAt: any
  }
}) {
  return {
    recentCount: subquery.recentCount,
    totalCount: subquery.totalCount,
    firstSeenDate: subquery.firstSeenDate,
    firstOccurredAt: subquery.firstOccurredAt,
    lastSeenDate: subquery.lastSeenDate,
    lastOccurredAt: subquery.lastOccurredAt,
    isNew: sql<boolean>`(${issues.createdAt} >= NOW() - INTERVAL '7 days')`.as(
      'isNew',
    ),
    isResolved: sql<boolean>`(${issues.resolvedAt} IS NOT NULL)`.as(
      'isResolved',
    ),
    isRegressed: sql<boolean>`(
        ${issues.resolvedAt} IS NOT NULL
        AND ${issues.ignoredAt} IS NULL
        AND ${subquery.lastSeenDate} > ${issues.resolvedAt}
      )`.as('isRegressed'),
    isEscalating: sql<boolean>`(
        ${issues.escalatingAt} IS NOT NULL
        AND ${issues.escalatingAt} > NOW() - INTERVAL '${sql.raw(String(ESCALATION_EXPIRATION_DAYS))} days'
      )`.as('isEscalating'),
    isIgnored: sql<boolean>`(${issues.ignoredAt} IS NOT NULL)`.as('isIgnored'),
    isMerged: sql<boolean>`(${issues.mergedAt} IS NOT NULL)`.as('isMerged'),
  }
}
