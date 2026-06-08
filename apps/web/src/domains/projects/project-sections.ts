import {
  BellRingIcon,
  Building2,
  CreditCard,
  DatabaseIcon,
  Key,
  type LucideIcon,
  Package,
  Plug,
  ScanSearch,
  SettingsIcon,
  ShieldAlertIcon,
  TagsIcon,
  TextAlignStartIcon,
  UserRound,
  Users,
} from "lucide-react"
import { useMemo } from "react"
import { useHasFeatureFlag } from "../feature-flags/feature-flags.collection.ts"

/**
 * Single source of truth for the navigable sections of a project and its settings
 * pages. Consumed by the project sidebar, the settings sub-nav, and the global command
 * palette so the three never drift. Feature-flag gating is expressed declaratively via
 * the optional `flag` field and resolved by the `useVisible*` hooks below.
 */

type SectionFlag = "behaviours" | "monitors" | "slack"

interface ProjectSection {
  readonly key: string
  readonly label: string
  readonly icon: LucideIcon
  readonly path: (projectSlug: string) => string
  readonly isActive: (pathname: string, projectSlug: string) => boolean
  readonly flag?: SectionFlag
}

const PROJECT_SECTIONS: readonly ProjectSection[] = [
  {
    key: "traces",
    label: "Traces",
    icon: TextAlignStartIcon,
    path: (slug) => `/projects/${slug}`,
    isActive: (pathname, slug) =>
      pathname === `/projects/${slug}` ||
      pathname === `/projects/${slug}/` ||
      pathname.startsWith(`/projects/${slug}/traces`),
  },
  {
    key: "issues",
    label: "Issues",
    icon: ShieldAlertIcon,
    path: (slug) => `/projects/${slug}/issues`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/issues`),
  },
  {
    key: "behaviours",
    label: "Behaviours",
    icon: TagsIcon,
    path: (slug) => `/projects/${slug}/behaviours`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/behaviours`),
    flag: "behaviours",
  },
  {
    key: "monitors",
    label: "Monitors",
    icon: BellRingIcon,
    path: (slug) => `/projects/${slug}/monitors`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/monitors`),
    flag: "monitors",
  },
  {
    key: "datasets",
    label: "Datasets",
    icon: DatabaseIcon,
    path: (slug) => `/projects/${slug}/datasets`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/datasets`),
  },
]

/** Top-level Settings entry (rendered in the sidebar footer, separate from the main list). */
export const PROJECT_SETTINGS_SECTION: ProjectSection = {
  key: "settings",
  label: "Settings",
  icon: SettingsIcon,
  path: (slug) => `/projects/${slug}/settings`,
  isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/settings`),
}

interface ProjectSettingsItem {
  readonly key: string
  readonly label: string
  readonly icon: LucideIcon
  readonly path: (projectSlug: string) => string
  readonly flag?: SectionFlag
}

interface ProjectSettingsGroup {
  readonly title: string
  readonly items: readonly ProjectSettingsItem[]
}

const PROJECT_SETTINGS_GROUPS: readonly ProjectSettingsGroup[] = [
  {
    title: "Project",
    items: [
      { key: "general", label: "General", icon: Package, path: (slug) => `/projects/${slug}/settings/general` },
      {
        key: "settings-issues",
        label: "Issues",
        icon: ShieldAlertIcon,
        path: (slug) => `/projects/${slug}/settings/issues`,
      },
      { key: "flaggers", label: "Flaggers", icon: ScanSearch, path: (slug) => `/projects/${slug}/settings/flaggers` },
    ],
  },
  {
    title: "Organization",
    items: [
      {
        key: "organization",
        label: "General",
        icon: Building2,
        path: (slug) => `/projects/${slug}/settings/organization`,
      },
      { key: "members", label: "Members", icon: Users, path: (slug) => `/projects/${slug}/settings/members` },
      { key: "keys", label: "Keys", icon: Key, path: (slug) => `/projects/${slug}/settings/keys` },
      { key: "billing", label: "Billing", icon: CreditCard, path: (slug) => `/projects/${slug}/settings/billing` },
      {
        key: "integrations",
        label: "Integrations",
        icon: Plug,
        path: (slug) => `/projects/${slug}/settings/integrations`,
        flag: "slack",
      },
    ],
  },
  {
    title: "Personal",
    items: [
      { key: "account", label: "Account", icon: UserRound, path: (slug) => `/projects/${slug}/settings/account` },
    ],
  },
]

/** Resolves every feature flag referenced by the section tables in one place. */
function useSectionFlags(): Record<SectionFlag, boolean> {
  const behaviours = useHasFeatureFlag("behaviours")
  const monitors = useHasFeatureFlag("monitors")
  const slack = useHasFeatureFlag("slack")
  return useMemo(() => ({ behaviours, monitors, slack }), [behaviours, monitors, slack])
}

/** Project sections visible to the current org, in sidebar/palette order. */
export function useVisibleProjectSections(): readonly ProjectSection[] {
  const flags = useSectionFlags()
  return useMemo(() => PROJECT_SECTIONS.filter((section) => !section.flag || flags[section.flag]), [flags])
}

/** Settings groups with flag-gated items removed (empty groups are dropped). */
export function useVisibleProjectSettingsGroups(): readonly ProjectSettingsGroup[] {
  const flags = useSectionFlags()
  return useMemo(
    () =>
      PROJECT_SETTINGS_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.flag || flags[item.flag]),
      })).filter((group) => group.items.length > 0),
    [flags],
  )
}
