export type WorkspaceId = string;

export interface DomainEvent {
  readonly name: string;
  readonly workspaceId: WorkspaceId;
  readonly payload: Record<string, unknown>;
}
