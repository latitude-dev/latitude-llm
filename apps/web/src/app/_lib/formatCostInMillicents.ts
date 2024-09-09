export function formatCostInMillicents(cost_in_millicents: number) {
  return `$ ${cost_in_millicents / 100_000}`
}
