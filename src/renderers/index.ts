import { renderTable } from './table'
import { renderJSON } from './json'
import { renderPlain } from './plain'

export type OutputFormat = 'table' | 'json' | 'plain'

export interface Column {
  header: string
  key: string
  format?: (val: unknown) => string
}

export function render(
  format: OutputFormat,
  data: any[] | any,
  columns?: Column[],
): string {
  switch (format) {
    case 'json':
      return renderJSON(data)
    case 'table':
      return renderTable(
        Array.isArray(data) ? data : [data],
        columns || inferColumns(data),
      )
    case 'plain':
    default:
      return renderPlain(data)
  }
}

function inferColumns(
  data: any[] | any,
): Column[] {
  const first =
    Array.isArray(data) && data.length > 0
      ? data[0]
      : !Array.isArray(data)
        ? data
        : {}
  return Object.keys(first).map((key) => ({
    header: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
    key,
  }))
}

export function detectFormat(json?: boolean, plain?: boolean): OutputFormat {
  if (json) return 'json'
  if (plain) return 'plain'
  return 'table'
}
