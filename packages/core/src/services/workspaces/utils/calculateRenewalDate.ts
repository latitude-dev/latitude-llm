export function getLatestRenewalDate(firstRenewalDate: Date, targetDate: Date) {
  // If targetDate is before the first renewal date, return the first renewal date
  if (targetDate.getTime() < firstRenewalDate.getTime()) {
    return firstRenewalDate
  }

  const targetYear = targetDate.getFullYear()
  const targetMonth = targetDate.getMonth()
  const targetDay = targetDate.getDate()

  // The day of the month is always maintained so renewal day is the same
  const renewalDay = firstRenewalDate.getDate()

  // If month is january and day is before renewal day, we need to subtract 1 year
  const adjustedYear =
    targetMonth === 0 && targetDay < renewalDay ? targetYear - 1 : targetYear

  // Cases:
  //
  // A) If the target date's day is before the renewal day in the same month,
  //    we need to subtract 1 month.
  //    Example:
  //    First renewal date is 2021-01-15 and target date is 2021-02-10,
  //    the latest renewal date is 2021-01-15.
  //
  // B) If the target date's day is on or after the renewal day,
  //    we stay in the current month.
  //    Example:
  //    First renewal date is 2021-01-15 and target date is 2021-02-20,
  //    the latest renewal date is 2021-02-15.
  //
  //  NOTE: The % 12 ensures that the month is always between 0 and 11
  const adjustedMonth =
    (targetMonth - (targetDay < renewalDay ? 1 : 0) + 12) % 12

  return new Date(adjustedYear, adjustedMonth, renewalDay)
}
