export interface ProjectRecord {
  readonly id: string
  readonly organizationId: string
  readonly name: string
  readonly slug: string
  readonly description: string | null
  readonly deletedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateProjectInput {
  readonly organizationId: string
  readonly name: string
  readonly description?: string
}

export interface UpdateProjectInput {
  readonly organizationId: string
  readonly id: string
  readonly name?: string
  readonly description?: string | null
}

export interface DeleteProjectInput {
  readonly organizationId: string
  readonly id: string
}

export interface ListProjectsInput {
  readonly organizationId: string
}
