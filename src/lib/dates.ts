/**
 * Parse a date-input string ("YYYY-MM-DD") as **local** midnight.
 *
 * `new Date('2026-05-17')` is UTC midnight — in Norway (UTC+2) that's
 * 22:00 the previous day, so it displays one day off.
 * Appending T12:00:00 keeps us solidly in the target calendar day
 * regardless of the user's timezone.
 */
export function parseDateInput(value: string): number {
  return new Date(value + 'T12:00:00').getTime()
}

/**
 * Format a Unix timestamp as a "YYYY-MM-DD" string in the user's
 * local timezone, suitable for <input type="date"> value= props.
 */
export function formatDateInput(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
