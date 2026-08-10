import { TOPICS_BEHAVIOR_SLUG } from "@domain/taxonomy"

/**
 * Link props for opening a cluster of the **topic** tree.
 *
 * Both call sites (a user's behaviours, an experiment's behaviour comparison) render
 * clusters that come from a Topic-dimension read, so the topic behavior is the right
 * destination by construction rather than by choice. This exists so that fact is
 * stated once: the day either read starts returning facet-behavior clusters, its
 * destination has to be resolved from the cluster's own view instead, and this is the
 * single place that has to change.
 */
export const topicBehaviourClusterLink = (projectSlug: string, clusterId: string) =>
  ({
    to: "/projects/$projectSlug/behaviours/$behaviourSlug",
    params: { projectSlug, behaviourSlug: TOPICS_BEHAVIOR_SLUG },
    search: { behaviourPath: clusterId },
  }) as const
