import { Avatar, useToast } from "@repo/ui"
import { CircleDashedIcon, CircleUserRoundIcon, FlagIcon, UserRoundIcon, UsersRoundIcon } from "lucide-react"
import { useMemo } from "react"
import { useRegisterCommands } from "../../../../../../../components/command-palette/command-palette-provider.tsx"
import type { PaletteCommand } from "../../../../../../../components/command-palette/types.ts"
import {
  ISSUE_PRIORITY_META,
  type IssuePriorityGroupId,
} from "../../../../../../../components/issues/issue-priority-meta.tsx"
import { useIssueDetail, useUpdateIssueTriage } from "../../../../../../../domains/issues/issues.collection.ts"
import { useMembersCollection } from "../../../../../../../domains/members/members.collection.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"
import { useAuthenticatedUser } from "../../../../../-route-data.ts"

// Descending urgency in the drill-down: the most likely pick sits first.
const PRIORITY_COMMAND_ORDER = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
] as const satisfies readonly IssuePriorityGroupId[]

/**
 * Contributes "Assign to…" and "Set priority…" drill-down commands to the
 * command palette while an issue page is open. Both reuse the same
 * `updateIssueTriage` mutation the right-rail pickers use, so list grouping
 * and detail queries revalidate identically.
 */
export function useIssueTriageCommands({
  projectId,
  issueId,
}: {
  readonly projectId: string
  readonly issueId: string
}) {
  const { toast } = useToast()
  const me = useAuthenticatedUser()
  const { data: issue } = useIssueDetail({ projectId, issueId })
  const { data: members } = useMembersCollection()
  const triage = useUpdateIssueTriage(projectId, issueId)

  const paletteCommands = useMemo<readonly PaletteCommand[]>(() => {
    if (!issue) return []

    const performTriage = async (
      input: { readonly assigneeId: string | null } | { readonly priority: (typeof PRIORITY_COMMAND_ORDER)[number] },
      successMessage: string,
    ) => {
      try {
        if ("assigneeId" in input) {
          await triage.mutateAsync({ assigneeId: input.assigneeId })
        } else {
          await triage.mutateAsync({ priority: input.priority === "none" ? null : input.priority })
        }
        toast({ description: successMessage })
      } catch (error) {
        toast({ variant: "destructive", description: toUserMessage(error) })
      }
    }

    const memberChildren: PaletteCommand[] = (members ?? [])
      .filter((member) => member.status === "active" && member.userId && member.userId !== me.id)
      .map((member) => {
        const displayName = member.name?.trim() && member.name.trim().length > 0 ? member.name.trim() : member.email
        return { userId: member.userId as string, displayName, email: member.email, image: member.image }
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map(
        (member): PaletteCommand => ({
          id: `issue:${issueId}:assign:${member.userId}`,
          title: member.displayName,
          icon: UserRoundIcon,
          leading: <Avatar size="xs" name={member.displayName} imageSrc={member.image} />,
          section: "context",
          keywords: member.email,
          ...(issue.assigneeId === member.userId ? { subtitle: "Current" } : {}),
          perform: () => {
            if (issue.assigneeId === member.userId) return
            return performTriage({ assigneeId: member.userId }, `Assigned to ${member.displayName}.`)
          },
        }),
      )

    const assignChildren: PaletteCommand[] = [
      {
        id: `issue:${issueId}:assign:me`,
        title: "Me",
        icon: CircleUserRoundIcon,
        section: "context",
        keywords: "me myself self",
        ...(issue.assigneeId === me.id ? { subtitle: "Current" } : {}),
        perform: () => {
          if (issue.assigneeId === me.id) return
          return performTriage({ assigneeId: me.id }, "Assigned to you.")
        },
      },
      {
        id: `issue:${issueId}:assign:unassigned`,
        title: "Unassigned",
        icon: CircleDashedIcon,
        section: "context",
        keywords: "unassigned none nobody clear",
        ...(issue.assigneeId === null ? { subtitle: "Current" } : {}),
        perform: () => {
          if (issue.assigneeId === null) return
          return performTriage({ assigneeId: null }, "Assignee cleared.")
        },
      },
      ...memberChildren,
    ]

    const priorityChildren: PaletteCommand[] = PRIORITY_COMMAND_ORDER.map((priority): PaletteCommand => {
      const meta = ISSUE_PRIORITY_META[priority]
      const isCurrent = (issue.priority ?? "none") === priority
      return {
        id: `issue:${issueId}:priority:${priority}`,
        title: meta.label,
        icon: meta.icon,
        section: "context",
        keywords: `priority ${priority}`,
        ...(isCurrent ? { subtitle: "Current" } : {}),
        perform: () => {
          if (isCurrent) return
          return performTriage(
            { priority },
            priority === "none" ? "Priority cleared." : `Priority set to ${meta.label}.`,
          )
        },
      }
    })

    return [
      {
        kind: "parent",
        id: `issue:${issueId}:assign`,
        title: "Assign to…",
        icon: UsersRoundIcon,
        section: "context",
        group: "Issue",
        keywords: "assign assignee triage owner member",
        getChildren: () => assignChildren,
      },
      {
        kind: "parent",
        id: `issue:${issueId}:priority`,
        title: "Set priority…",
        icon: FlagIcon,
        section: "context",
        group: "Issue",
        keywords: "priority urgent high medium low triage",
        getChildren: () => priorityChildren,
      },
    ]
  }, [issue, issueId, me.id, members, toast, triage])

  useRegisterCommands(paletteCommands)
}
