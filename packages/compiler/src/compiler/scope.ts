export default class Scope {
  /**
   * Global stash
   * All variable values are stored in a single global array. This is done to allow multiple
   * scopes to share the same variable values and be able to modify them.
   *
   * For example:
   * ```sql
   * {var1 = 1}
   * {#if <condition>}
   *  {var1 = 2}
   *  {var2 = 3}
   * {/if}
   * ```
   * In this case, there are two scopes: root and if. Both scopes share the same variable `var1`,
   * and modifying it in the if scope should also modify it in the root scope. But `var2` is only
   * defined in the if scope and should not be accessible in the root scope.
   */
  private static stash: unknown[] = [] // Stash of every variable value in every scope
  private static readFromStash(index: number): unknown {
    return Scope.stash[index]
  }
  private static addToStash(value: unknown): number {
    Scope.stash.push(value)
    return Scope.stash.length - 1
  }

  private static modifyStash(index: number, value: unknown): void {
    Scope.stash[index] = value
  }

  /**
   * Local scope
   * Every scope has its own local stash that contains the indexes of the variables and constants
   * in the global stash.
   */
  private consts: Record<string, number> = {} // Index of every constant in the stash in the current scope
  private vars: Record<string, number> = {} // Index of every variable in the stash in the current scope

  constructor() {}

  exists(name: string): boolean {
    return name in this.consts || name in this.vars
  }

  isConst(name: string): boolean {
    return name in this.consts
  }

  get(name: string): unknown {
    const index = this.consts[name] ?? this.vars[name] ?? undefined
    if (index === undefined)
      throw new Error(`Variable '${name}' does not exist`)
    return Scope.readFromStash(index)
  }

  defineConst(name: string, value: unknown): void {
    if (this.exists(name)) throw new Error(`Variable '${name}' already exists`)
    this.consts[name] = Scope.addToStash(value)
  }

  set(name: string, value: unknown): void {
    if (this.isConst(name))
      throw new Error(`Constant '${name}' cannot be modified`)
    if (!this.exists(name)) {
      this.vars[name] = Scope.addToStash(value)
      return
    }
    const index = this.vars[name]!
    Scope.modifyStash(index, value)
  }

  copy(): Scope {
    const scope = new Scope()
    scope.consts = { ...this.consts }
    scope.vars = { ...this.vars }
    return scope
  }
}
