import type { VariantTimeRange } from "@domain/experiments"
import { toSlug } from "@domain/shared"
import {
  CalendarRangeIcon,
  LayersIcon,
  type LucideIcon,
  SlidersHorizontalIcon,
  SplitIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
} from "lucide-react"
import type { NewExperimentVariant } from "./experiments.collection.ts"

const EXPERIMENT_PRESETS = ["custom", "abTest", "versions", "seasonal", "failures", "outliers"] as const
export type ExperimentPreset = (typeof EXPERIMENT_PRESETS)[number]

interface ExperimentPresetOption {
  readonly value: ExperimentPreset
  readonly label: string
  readonly description: string
  readonly icon: LucideIcon
}

/** Card-selector catalog for the "Preset" field, in display order. `custom` is the default. */
export const EXPERIMENT_PRESET_OPTIONS: readonly ExperimentPresetOption[] = [
  {
    value: "custom",
    label: "Custom",
    description: "Start from scratch with two empty variants",
    icon: SlidersHorizontalIcon,
  },
  {
    value: "abTest",
    label: "A/B Test",
    description: "Two variants split by an A tag and a B tag",
    icon: SplitIcon,
  },
  {
    value: "versions",
    label: "Versions",
    description: "Current version vs the last three tagged versions",
    icon: LayersIcon,
  },
  {
    value: "seasonal",
    label: "Seasonal",
    description: "Four variants across Winter, Spring, Summer and Fall",
    icon: CalendarRangeIcon,
  },
  {
    value: "failures",
    label: "Failures",
    description: "Successful sessions vs sessions with errors",
    icon: TriangleAlertIcon,
  },
  {
    value: "outliers",
    label: "Outliers",
    description: "Normal sessions vs the longest, costliest and slowest to first token",
    icon: TrendingUpIcon,
  },
]

const emptyVariant = (name: string, baseline: boolean): NewExperimentVariant => ({
  name,
  baseline,
  filterSet: {},
  query: null,
  timeRange: null,
})

const tagFiltered = (name: string, baseline: boolean, tag: string): NewExperimentVariant => ({
  name,
  baseline,
  filterSet: { tags: [{ op: "in", value: [tag] }] },
  query: null,
  timeRange: null,
})

const percentileFiltered = (name: string, field: "duration" | "cost" | "ttft"): NewExperimentVariant => ({
  name,
  baseline: false,
  filterSet: { [field]: [{ op: "gtePercentile", value: 99 }] },
  query: null,
  timeRange: null,
})

/**
 * Absolute range of the most recently *completed* occurrence of a meteorological season, relative to
 * `now`: the season's start month (0-indexed; `startsPreviousDecember` shifts Winter's start into the
 * prior December) spanning `MONTHS_PER_SEASON`, stepping back a year until the season has fully ended.
 * The upper bound is the first instant of the following month, so the whole season is covered.
 */
const MONTHS_PER_SEASON = 3
const seasonRange = (now: Date, startMonth: number, startsPreviousDecember: boolean): VariantTimeRange => {
  let year = now.getFullYear()
  for (;;) {
    const start = new Date(startsPreviousDecember ? year - 1 : year, startMonth, 1, 0, 0, 0, 0)
    const end = new Date(start.getFullYear(), start.getMonth() + MONTHS_PER_SEASON, 1, 0, 0, 0, 0)
    if (end.getTime() <= now.getTime())
      return { type: "absolute", fromIso: start.toISOString(), toIso: end.toISOString() }
    year -= 1
  }
}

/**
 * Seed variants for a creation preset, or `undefined` for `custom` (which falls back to the domain's
 * default baseline + one empty variant). `name` is the experiment name; its slug builds the A/B tags
 * (tags can't contain spaces).
 */
export const buildPresetVariants = (
  preset: ExperimentPreset,
  name: string,
  now: Date,
): readonly NewExperimentVariant[] | undefined => {
  switch (preset) {
    case "custom":
      return undefined
    case "abTest": {
      const slug = toSlug(name)
      return [tagFiltered("Variant A", true, `${slug}-A`), tagFiltered("Variant B", false, `${slug}-B`)]
    }
    case "versions":
      return [
        tagFiltered("Current version", true, "version-A"),
        tagFiltered("Version B", false, "version-B"),
        tagFiltered("Version C", false, "version-C"),
        tagFiltered("Version D", false, "version-D"),
      ]
    case "seasonal":
      return [
        { ...emptyVariant("Winter", true), timeRange: seasonRange(now, 11, true) },
        { ...emptyVariant("Spring", false), timeRange: seasonRange(now, 2, false) },
        { ...emptyVariant("Summer", false), timeRange: seasonRange(now, 5, false) },
        { ...emptyVariant("Fall", false), timeRange: seasonRange(now, 8, false) },
      ]
    case "failures":
      return [
        { ...emptyVariant("Successful sessions", true), filterSet: { errorCount: [{ op: "lte", value: 0 }] } },
        { ...emptyVariant("Failed sessions", false), filterSet: { errorCount: [{ op: "gte", value: 1 }] } },
      ]
    case "outliers":
      return [
        emptyVariant("Normal sessions", true),
        percentileFiltered("Longer sessions", "duration"),
        percentileFiltered("Costlier sessions", "cost"),
        percentileFiltered("Slower sessions", "ttft"),
      ]
  }
}
