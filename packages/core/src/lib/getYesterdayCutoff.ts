export function getYesterdayCutoff() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 1)
  cutoff.setHours(0, 0, 0, 0) // Start of yesterday (00:00:00)
  return cutoff
}
