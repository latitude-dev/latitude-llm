export interface OrganizationRecord {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly role: "owner" | "admin" | "member"
}

export interface CreateOrganizationInput {
  readonly name: string
  readonly slug?: string
}
