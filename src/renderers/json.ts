export function renderJSON(
  data: any[] | any,
): string {
  return JSON.stringify(data, null, 2)
}
