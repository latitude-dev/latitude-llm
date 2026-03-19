import z from "zod"

export const sortDirectionSchema = z.enum(["asc", "desc"])
export type SortDirection = z.infer<typeof sortDirectionSchema>
