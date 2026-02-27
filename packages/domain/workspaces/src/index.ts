import type { WorkspaceId } from "@domain/shared-kernel";

export interface Workspace {
  readonly id: WorkspaceId;
  readonly name: string;
}
