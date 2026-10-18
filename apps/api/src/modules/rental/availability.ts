export type BookedRange = { quantity: number; startsOn: Date; endsOn: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

const dayIndex = (date: Date) =>
  Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      DAY_MS,
  );

/**
 * Smallest number of units still free on any single day of [from, to]
 * (both inclusive). Bookings that end on the day another starts overlap on
 * that day, so equipment needs a free day between back-to-back jobs unless
 * the stock covers both.
 */
export function minAvailable(
  totalUnits: number,
  bookings: BookedRange[],
  from: Date,
  to: Date,
): number {
  const first = dayIndex(from);
  const last = dayIndex(to);
  if (last < first) return 0;

  // Sweep over the days where the booked quantity can change.
  const changePoints = new Set<number>([first]);
  for (const booking of bookings) {
    const start = dayIndex(booking.startsOn);
    const end = dayIndex(booking.endsOn);
    if (start > first && start <= last) changePoints.add(start);
    if (end + 1 > first && end + 1 <= last) changePoints.add(end + 1);
  }

  let minimum = totalUnits;
  for (const day of changePoints) {
    const booked = bookings
      .filter(
        (booking) =>
          dayIndex(booking.startsOn) <= day && dayIndex(booking.endsOn) >= day,
      )
      .reduce((sum, booking) => sum + booking.quantity, 0);
    minimum = Math.min(minimum, totalUnits - booked);
  }
  return Math.max(minimum, 0);
}
