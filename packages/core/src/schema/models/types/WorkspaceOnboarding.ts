import { InferSelectModel } from "drizzle-orm";
import { workspaceOnboarding } from "../workspaceOnboarding";

export type WorkspaceOnboarding = InferSelectModel<typeof workspaceOnboarding>
