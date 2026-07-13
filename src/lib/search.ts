/** Case-insensitive match: query words must all appear somewhere in the haystack. */
export function matchesSearch(query: string, ...parts: Array<string | number | null | undefined>): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = parts
    .filter((p) => p !== null && p !== undefined && p !== '')
    .map((p) => String(p).toLowerCase())
    .join(' ')
  return q.split(/\s+/).every((word) => haystack.includes(word))
}
