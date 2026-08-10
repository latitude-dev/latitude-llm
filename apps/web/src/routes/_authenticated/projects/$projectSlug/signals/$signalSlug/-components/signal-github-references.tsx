import {
  Button,
  GithubIcon,
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Status,
  type StatusProps,
  Text,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ExternalLink, GitCommit, GitPullRequest } from "lucide-react"
import {
  type GithubSignalReferenceRecord,
  listSignalGithubReferences,
  signalGithubReferencesQueryKey,
} from "../../../../../../../domains/github/github.functions.ts"
import { selectPrimaryGithubReference, sortGithubReferencesForList } from "./signal-github-reference-selection.ts"

const isPr = (reference: GithubSignalReferenceRecord): boolean => reference.referenceType === "pull_request"

const shortSha = (sha: string | null): string => (sha ? sha.slice(0, 7) : "commit")

const referenceLabel = (reference: GithubSignalReferenceRecord): string =>
  isPr(reference) ? `#${reference.prNumber}` : shortSha(reference.commitSha)

const referenceRef = (reference: GithubSignalReferenceRecord): string =>
  isPr(reference)
    ? `${reference.repoFullName}#${reference.prNumber}`
    : `${reference.repoFullName}@${shortSha(reference.commitSha)}`

const referenceDate = (reference: GithubSignalReferenceRecord): string =>
  reference.mergedAt ?? reference.updatedAt ?? reference.createdAt

function referenceStatus(reference: GithubSignalReferenceRecord): { variant: StatusProps["variant"]; label: string } {
  if (!isPr(reference)) return { variant: "info", label: "Committed" }
  switch (reference.prState) {
    case "draft":
      return { variant: "neutral", label: "Draft" }
    case "open":
      return { variant: "success", label: "Open" }
    case "merged":
      return { variant: "info", label: "Merged" }
    case "closed":
      return { variant: "destructive", label: "Closed" }
    default:
      return { variant: "neutral", label: "Open" }
  }
}

const appliedActionLabel = (reference: GithubSignalReferenceRecord): string | null => {
  if (!reference.actionAppliedAt) return null
  if (reference.action === "resolve") return "Resolved this signal"
  if (reference.action === "unresolve") return "Reopened this signal"
  return null
}

function ReferenceRow({ reference }: { readonly reference: GithubSignalReferenceRecord }) {
  const status = referenceStatus(reference)
  const applied = appliedActionLabel(reference)
  const author = reference.authorLogin ? `by ${reference.authorLogin}` : null
  const meta = author ? `${referenceRef(reference)} · ${author}` : referenceRef(reference)

  return (
    <a
      href={reference.url}
      target="_blank"
      rel="noreferrer"
      className="flex cursor-pointer flex-col gap-1 px-2 py-3 first:pt-2 last:pb-2 hover:bg-muted"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon icon={isPr(reference) ? GitPullRequest : GitCommit} size="sm" className="shrink-0" />
          <Text.H5 weight="semibold" ellipsis>
            {reference.title}
          </Text.H5>
        </div>
        <Status variant={status.variant} label={status.label} className="shrink-0" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted" ellipsis>
          {meta}
        </Text.H6>
        <Text.H6 color="foregroundMuted" className="shrink-0">
          {relativeTime(new Date(referenceDate(reference)))}
        </Text.H6>
      </div>
      {applied ? <Text.H6 color="foreground">{applied}</Text.H6> : null}
    </a>
  )
}

/**
 * The standalone first action on the signal header: fetches the signal's
 * references and renders nothing when the signal has no references (5.11).
 */
export function SignalGithubReferencesPill({
  projectId,
  signalId,
  projectSlug,
  disabled = false,
}: {
  readonly projectId: string
  readonly signalId: string
  readonly projectSlug: string
  readonly disabled?: boolean
}) {
  const { data } = useQuery({
    queryKey: signalGithubReferencesQueryKey(projectId, signalId),
    queryFn: () => listSignalGithubReferences({ data: { projectId, signalId } }),
    enabled: !disabled && signalId.length > 0,
  })

  if (!data || data.length === 0) return null
  return <SignalGithubReferences references={data} projectSlug={projectSlug} />
}

function SignalGithubReferences({
  references,
  projectSlug,
}: {
  readonly references: readonly GithubSignalReferenceRecord[]
  readonly projectSlug: string
}) {
  const primary = selectPrimaryGithubReference(references)
  if (!primary) return null

  const status = referenceStatus(primary)
  const extra = references.length - 1
  const pillContent = (
    <>
      <Icon icon={GithubIcon} size="sm" />
      {referenceLabel(primary)}
      {extra > 0 ? <span className="text-muted-foreground">{`+${extra}`}</span> : null}
      <Status variant={status.variant} label={status.label} className="shrink-0" />
    </>
  )

  if (references.length === 1) {
    // asChild merges Button's inner `w-full` onto the anchor (no inline-flex outer wrapper);
    // `w-auto` restores content-width so the pill doesn't stretch the header actions row.
    return (
      <Button asChild variant="outline" size="sm" className="w-auto text-sm">
        <a href={primary.url} target="_blank" rel="noreferrer">
          {pillContent}
        </a>
      </Button>
    )
  }

  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-sm">
          {pillContent}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-w-72 p-2">
        <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
          <Text.H6 weight="semibold">Version control history</Text.H6>
          <Link
            to="/projects/$projectSlug/settings/integrations/github"
            params={{ projectSlug }}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View all
            <Icon icon={ExternalLink} size="xs" />
          </Link>
        </div>
        <div className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
          {sortGithubReferencesForList(references).map((reference) => (
            <ReferenceRow key={reference.id} reference={reference} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
