// Small random ID helper. Uses crypto.randomUUID when available,
// falling back to a short base36 random for very old runtimes.
export function uid(): string {
  const c =
    typeof crypto !== 'undefined'
      ? (crypto as Crypto & { randomUUID?: () => string })
      : undefined
  if (c?.randomUUID) return c.randomUUID()
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  )
}
