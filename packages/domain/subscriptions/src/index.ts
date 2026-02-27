export interface Subscription {
  readonly workspaceId: string;
  readonly plan: "free" | "pro" | "enterprise";
}
