import type { FeatureFlagId } from "@domain/feature-flags"
import {
  BellRingIcon,
  Building2,
  CreditCard,
  DatabaseIcon,
  Fingerprint,
  FlaskConical,
  Key,
  type LucideIcon,
  MessagesSquareIcon,
  Package,
  Plug,
  ScanSearch,
  SettingsIcon,
  Share2Icon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
  TagsIcon,
  UserRound,
  Users,
  UsersRoundIcon,
  WrenchIcon,
} from "lucide-react"
import { useMemo } from "react"
import { useFeatureFlags } from "../feature-flags/feature-flags.collection.ts"

type SectionGroupKey = "observe" | "understand" | "refine"

interface ProjectSection {
  readonly key: string
  readonly label: string
  readonly icon: LucideIcon
  readonly group: SectionGroupKey
  readonly path: (projectSlug: string) => string
  readonly isActive: (pathname: string, projectSlug: string) => boolean
  /** When set, the section renders only if this feature flag is enabled for the org. */
  readonly featureFlag?: FeatureFlagId
}

const PROJECT_SECTIONS: readonly ProjectSection[] = [
  {
    key: "sessions",
    label: "Sessions",
    icon: MessagesSquareIcon,
    group: "observe",
    path: (slug) => `/projects/${slug}`,
    isActive: (pathname, slug) => pathname === `/projects/${slug}` || pathname === `/projects/${slug}/`,
  },
  {
    key: "users",
    label: "Users",
    icon: UsersRoundIcon,
    group: "observe",
    path: (slug) => `/projects/${slug}/users`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/users`),
  },
  {
    key: "tools",
    label: "Tools",
    icon: WrenchIcon,
    group: "observe",
    path: (slug) => `/projects/${slug}/tools`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/tools`),
  },
  {
    key: "signals",
    label: "Signals",
    icon: ShieldAlertIcon,
    group: "understand",
    path: (slug) => `/projects/${slug}/signals`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/signals`),
  },
  {
    key: "behaviours",
    label: "Behaviors",
    icon: TagsIcon,
    group: "understand",
    path: (slug) => `/projects/${slug}/behaviours`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/behaviours`),
  },
  {
    key: "experiments",
    label: "Experiments",
    icon: FlaskConical,
    group: "understand",
    path: (slug) => `/projects/${slug}/experiments`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/experiments`),
  },
  {
    key: "custom-behaviours",
    label: "Custom behaviors",
    icon: SlidersHorizontalIcon,
    group: "understand",
    path: (slug) => `/projects/${slug}/custom-behaviours`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/custom-behaviours`),
    featureFlag: "customBehaviors",
  },
  {
    key: "monitors",
    label: "Monitors",
    icon: BellRingIcon,
    group: "refine",
    path: (slug) => `/projects/${slug}/monitors`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/monitors`),
  },
  {
    key: "datasets",
    label: "Datasets",
    icon: DatabaseIcon,
    group: "refine",
    path: (slug) => `/projects/${slug}/datasets`,
    isActive: (pathname, slug) => pathname.startsWith(`/projects/${slug}/datasets`),
  },
]

interface ProjectSectionGroup {
  readonly key: SectionGroupKey
  readonly label: string
}

const PROJECT_SECTION_GROUPS: readonly ProjectSectionGroup[] = [
  { key: "observe", label: "Observe" },
  { key: "understand", label: "Understand" },
  { key: "refine", label: "Refine" },
]

/** Top-level Settings entry (rendered in the sidebar footer, separate from the main list). */
export const PROJECT_SETTINGS_SECTION: Omit<ProjectSection, "group"> = {
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
        key: "settings-signals",
        label: "Signals",
        icon: ShieldAlertIcon,
        path: (slug) => `/projects/${slug}/settings/signals`,
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
        key: "data-destinations",
        label: "Data destinations",
        icon: Share2Icon,
        path: (slug) => `/projects/${slug}/settings/data-destinations`,
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

/** Project sections visible to the current org, in sidebar/palette order. */
export function useVisibleProjectSections(): readonly ProjectSection[] {
  const flags = useFeatureFlags()
  return useMemo(
    () => PROJECT_SECTIONS.filter((section) => !section.featureFlag || flags.has(section.featureFlag)),
    [flags],
  )
}

interface VisibleProjectSectionGroup extends ProjectSectionGroup {
  readonly sections: readonly ProjectSection[]
}

/** Visible project sections bucketed into their sidebar groups (empty groups dropped). */
export function useVisibleProjectSectionGroups(): readonly VisibleProjectSectionGroup[] {
  const sections = useVisibleProjectSections()
  return useMemo(
    () =>
      PROJECT_SECTION_GROUPS.map((group) => ({
        ...group,
        sections: sections.filter((section) => section.group === group.key),
      })).filter((group) => group.sections.length > 0),
    [sections],
  )
}

/** Settings groups in sidebar order. */
export function useVisibleProjectSettingsGroups(): readonly ProjectSettingsGroup[] {
  return PROJECT_SETTINGS_GROUPS
}
