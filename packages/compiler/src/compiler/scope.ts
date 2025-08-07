export type ScopePointers = { [key: string]: number }
export type ScopeStash = unknown[]

export default class Scope {
  /**
   * Global stash
   * All variable values are stored in a single global array. This is done to allow multiple
   * scopes to share the same variable values and be able to modify them.
   *
   * For example:
   * ```md
   * {var1 = 1}
   * {#if <condition>}
   *  {var1 = 2}
   *  {var2 = 3}
   * {/if}
   * ```
   * In this case, there are two scopes: root and if. Both scopes share the same variable `var1`,
   * and modifying it in the if scope should also modify it in the root scope. But `var2` is only
   * defined in the if scope and should not be accessible in the root scope.
   *
   * Local pointers
   * Every scope has its own local pointers that contains the indexes of the variables in the global stash.
   */
  private globalStash: ScopeStash = [] // Stash of every variable value in the global scope
  private localPointers: ScopePointers = {} // Index of every variable in the stash in the current scope

  constructor(initialState: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initialState)) {
      this.localPointers[key] = this.addToStash(value)
    }
  }

  static withStash(stash: ScopeStash): Scope {
    const scope = new Scope()
    scope.globalStash = stash
    return scope
  }

  private readFromStash(index: number): unknown {
    return this.globalStash[index]
  }

  private addToStash(value: unknown): number {
    this.globalStash.push(value)
    return this.globalStash.length - 1
  }

  private modifyStash(index: number, value: unknown): void {
    this.globalStash[index] = value
  }

  exists(name: string): boolean {
    return name in this.localPointers
  }

  get(name: string): unknown {
    const index = this.localPointers[name] ?? undefined
    if (index === undefined) throw new Error(`Variable '${name}' does not exist`)
    return this.readFromStash(index)
  }

  set(name: string, value: unknown): void {
    if (!this.exists(name)) {
      this.localPointers[name] = this.addToStash(value)
      return
    }
    const index = this.localPointers[name]!
    this.modifyStash(index, value)
  }

  copy(localPointers?: ScopePointers): Scope {
    const scope = new Scope()
    scope.globalStash = this.globalStash
    scope.localPointers = { ...(localPointers ?? this.localPointers) }
    return scope
  }

  getStash(): ScopeStash {
    return this.globalStash
  }

  getPointers(): ScopePointers {
    return this.localPointers
  }

  setPointers(pointers: ScopePointers): void {
    this.localPointers = pointers
  }
}

export type ScopeContext = {
  onlyPredefinedVariables?: Set<string> // If defined, all usedUndefinedVariables that are not in this set will return an error
  usedUndefinedVariables: Set<string> // Variables that are not in current scope but have been used
  definedVariables: Set<string> // Variables that are in current scope
}
