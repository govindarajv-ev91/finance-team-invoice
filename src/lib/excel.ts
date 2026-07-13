import * as XLSX from 'xlsx'

export function downloadExcel(
  rows: Record<string, string | number | null | undefined>[],
  sheetName: string,
  fileName: string,
) {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))
  XLSX.writeFile(workbook, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`)
}
