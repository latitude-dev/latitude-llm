import { z } from "zod"

export const adminTaxonomySubcategorySchema = z.object({
  id: z.string(),
  categoryId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  observationCount: z.number().int().nonnegative(),
  state: z.enum(["active", "merged", "deprecated"]),
  firstObservedAt: z.date(),
  lastObservedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type AdminTaxonomySubcategory = z.infer<typeof adminTaxonomySubcategorySchema>

export const adminTaxonomyCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  clusterCount: z.number().int().nonnegative(),
  observationCount: z.number().int().nonnegative(),
  state: z.enum(["active", "deprecated"]),
  clusteredAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  subcategories: z.array(adminTaxonomySubcategorySchema),
})
export type AdminTaxonomyCategory = z.infer<typeof adminTaxonomyCategorySchema>

export const adminProjectTaxonomySchema = z.object({
  categories: z.array(adminTaxonomyCategorySchema),
  uncategorized: z.array(adminTaxonomySubcategorySchema),
})
export type AdminProjectTaxonomy = z.infer<typeof adminProjectTaxonomySchema>
