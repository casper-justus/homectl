export function renderPlain(
  data: any[] | any,
): string {
  const items = Array.isArray(data) ? data : [data]
  if (items.length === 0) return 'No results.'

  return items
    .map((item) =>
      Object.entries(item)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => {
          const label = k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1')
          return `  ${label}: ${String(v)}`
        })
        .join('\n'),
    )
    .join('\n\n')
}
