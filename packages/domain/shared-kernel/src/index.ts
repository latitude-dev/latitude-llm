export interface DomainEvent<
  TName extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: TName;
  readonly workspaceId: string;
  readonly payload: TPayload;
}
