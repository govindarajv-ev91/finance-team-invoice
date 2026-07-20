export type DateRangePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'custom'

export interface CreatedDateFilter {
  preset: DateRangePreset
  customFrom: string
  customTo: string
}

export const DEFAULT_CREATED_DATE_FILTER: CreatedDateFilter = {
  preset: 'all',
  customFrom: '',
  customTo: '',
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/** Monday as the first day of the week. */
function startOfWeekMonday(date: Date): Date {
  const d = startOfDay(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function parseLocalDateInput(value: string): Date | null {
  if (!value) return null
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

export function getCreatedDateRange(
  filter: CreatedDateFilter,
  now: Date = new Date(),
): { start: Date | null; end: Date | null } {
  switch (filter.preset) {
    case 'all':
      return { start: null, end: null }
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      return { start: startOfDay(y), end: endOfDay(y) }
    }
    case 'this_week':
      return { start: startOfWeekMonday(now), end: endOfDay(now) }
    case 'last_week': {
      const thisWeekStart = startOfWeekMonday(now)
      const lastWeekEnd = new Date(thisWeekStart)
      lastWeekEnd.setMilliseconds(-1)
      const lastWeekStart = new Date(thisWeekStart)
      lastWeekStart.setDate(lastWeekStart.getDate() - 7)
      return { start: startOfDay(lastWeekStart), end: endOfDay(lastWeekEnd) }
    }
    case 'custom': {
      const from = parseLocalDateInput(filter.customFrom)
      const to = parseLocalDateInput(filter.customTo)
      if (!from && !to) return { start: null, end: null }
      return {
        start: from ? startOfDay(from) : null,
        end: to ? endOfDay(to) : from ? endOfDay(from) : null,
      }
    }
    default:
      return { start: null, end: null }
  }
}

export function matchesCreatedDateFilter(
  createdAt: string | null | undefined,
  filter: CreatedDateFilter,
): boolean {
  if (filter.preset === 'all') return true
  if (!createdAt) return false

  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false

  const { start, end } = getCreatedDateRange(filter)
  if (start && created < start) return false
  if (end && created > end) return false
  return true
}

export function createdDateFilterLabel(filter: CreatedDateFilter): string {
  switch (filter.preset) {
    case 'all':
      return 'All dates'
    case 'today':
      return 'Today'
    case 'yesterday':
      return 'Yesterday'
    case 'this_week':
      return 'This week'
    case 'last_week':
      return 'Last week'
    case 'custom':
      if (filter.customFrom && filter.customTo) {
        return `${filter.customFrom} to ${filter.customTo}`
      }
      if (filter.customFrom) return `From ${filter.customFrom}`
      if (filter.customTo) return `Until ${filter.customTo}`
      return 'Custom date'
    default:
      return 'All dates'
  }
}
