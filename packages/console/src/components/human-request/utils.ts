export function formatRemainingTime(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null
  const expiry = new Date(expiresAt).getTime()
  const remaining = expiry - Date.now()
  if (remaining <= 0) return "Expired"
  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h remaining`
  }
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}
