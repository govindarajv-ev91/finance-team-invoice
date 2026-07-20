import type { CreatedDateFilter, DateRangePreset } from '../lib/dateRange'
import { createdDateFilterLabel } from '../lib/dateRange'

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'custom', label: 'Custom' },
]

interface DateRangeFilterProps {
  label?: string
  value: CreatedDateFilter
  onChange: (value: CreatedDateFilter) => void
}

export function DateRangeFilter({
  label = 'Created date',
  value,
  onChange,
}: DateRangeFilterProps) {
  return (
    <div className="date-range-filter">
      <span className="date-range-label">{label}</span>
      <div className="filter-tabs date-range-tabs">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`chip ${value.preset === preset.id ? 'active' : ''}`}
            onClick={() =>
              onChange({
                ...value,
                preset: preset.id,
              })
            }
          >
            {preset.label}
          </button>
        ))}
      </div>
      {value.preset === 'custom' && (
        <div className="date-range-custom">
          <label>
            From
            <input
              type="date"
              value={value.customFrom}
              onChange={(e) => onChange({ ...value, customFrom: e.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={value.customTo}
              onChange={(e) => onChange({ ...value, customTo: e.target.value })}
            />
          </label>
        </div>
      )}
      {value.preset !== 'all' && (
        <span className="muted tiny date-range-active">{createdDateFilterLabel(value)}</span>
      )}
    </div>
  )
}
