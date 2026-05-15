import Table from 'cli-table3'
import { Column } from './index'

export function renderTable(
  data: any[],
  columns: Column[],
): string {
  if (data.length === 0) {
    return 'No results.'
  }

  const table = new Table({
    head: columns.map((c) => c.header),
    style: {
      head: ['cyan'],
      border: ['grey'],
    },
    chars: {
      'top': '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      'bottom': '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      'left': '│',
      'left-mid': '├',
      'mid': '─',
      'mid-mid': '┼',
      'right': '│',
      'right-mid': '┤',
      'middle': '│',
    },
  })

  for (const row of data) {
    const values = columns.map((col) => {
      const val = row[col.key]
      if (val === null || val === undefined) return ''
      if (col.format) return col.format(val)
      return String(val)
    })
    table.push(values)
  }

  return table.toString()
}
