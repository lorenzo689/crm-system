/**
 * Adds whole months in UTC and clamps to the last day of the target month
 * (31 Jan + 1 month = 28/29 Feb), so a monthly invoice never skips a month.
 */
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfTarget)));
}

/**
 * Next run strictly after `today`. A job that was down for several periods
 * produces one invoice and then resumes on schedule instead of back-filling.
 */
export function nextRunAfter(
  current: Date,
  intervalMonths: number,
  today: Date,
): Date {
  let next = addMonths(current, intervalMonths);
  let guard = 0;
  while (next <= today && guard++ < 1200) {
    next = addMonths(next, intervalMonths);
  }
  return next;
}
