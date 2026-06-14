import {
  BellRingIcon,
  Building2,
  CreditCard,
  DatabaseIcon,
  Fingerprint,
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
  UsersRoundIcon,
  WrenchIcon,
} from "lucide-react"
import { useMemo } from "react"
import { useHasFeatureFlag } from "../feature-flags/feature-flags.collection.ts"

type SectionFlag = "behaviours" | "monitors" | "tools"

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
    key: "behaviours",
    label: "Behaviors",
    icon: TagsIcon,
    path: (slug) => `/projects/${slug}/behaviours`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/behaviours`),
    flag: "behaviours",
  },
  {
    key: "users",
    label: "Users",
    icon: UsersRoundIcon,
    path: (slug) => `/projects/${slug}/users`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/users`),
  },
  {
    key: "tools",
    label: "Tools",
    icon: WrenchIcon,
    path: (slug) => `/projects/${slug}/tools`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/tools`),
    flag: "tools",
  },
  {
    key: "issues",
    label: "Issues",
    icon: ShieldAlertIcon,
    path: (slug) => `/projects/${slug}/issues`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/issues`),
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
      {
        key: "general",
        label: "General",
        icon: Package,
        path: (slug) => `/projects/${slug}/settings/general`,
      },
      {
        key: "settings-issues",
        label: "Issues",
        icon: ShieldAlertIcon,
        path: (slug) => `/projects/${slug}/settings/issues`,
      },
      {
        key: "flaggers",
        label: "Flaggers",
        icon: ScanSearch,
        path: (slug) => `/projects/${slug}/settings/flaggers`,
      },
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
      {
        key: "members",
        label: "Members",
        icon: Users,
        path: (slug) => `/projects/${slug}/settings/members`,
      },
      {
        key: "keys",
        label: "Keys",
        icon: Key,
        path: (slug) => `/projects/${slug}/settings/keys`,
      },
      {
        key: "billing",
        label: "Billing",
        icon: CreditCard,
        path: (slug) => `/projects/${slug}/settings/billing`,
      },
      {
        key: "integrations",
        label: "Integrations",
        icon: Plug,
        path: (slug) => `/projects/${slug}/settings/integrations`,
      },
      {
        key: "sso",
        label: "Single sign-on",
        icon: Fingerprint,
        path: (slug) => `/projects/${slug}/settings/sso`,
      },
    ],
  },
  {
    title: "Personal",
    items: [
      {
        key: "account",
        label: "Account",
        icon: UserRound,
        path: (slug) => `/projects/${slug}/settings/account`,
      },
    ],
  },
]

/** Resolves every feature flag referenced by the section tables in one place. */
function useSectionFlags(): Record<SectionFlag, boolean> {
  const behaviours = useHasFeatureFlag("behaviours")
  const monitors = useHasFeatureFlag("monitors")
  const tools = useHasFeatureFlag("tools")
  return useMemo(() => ({ behaviours, monitors, tools }), [behaviours, monitors, tools])
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
