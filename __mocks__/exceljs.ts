const mockSheet = {
  columns: [],
  getRow: jest.fn(() => ({
    getCell:   jest.fn(() => ({ value: null, style: {} })),
    // Spec: HU-012 — usado para estilar la fila de encabezados sin depender de
    // columnas fijas A-K (exceljs.Row.eachCell real invoca el callback por celda).
    eachCell:  jest.fn((cb?: (cell: { value: unknown; style: unknown }, col: number) => void) => {
      cb?.({ value: null, style: {} }, 1)
    }),
    height: 0,
  })),
  getCell:   jest.fn(() => ({ value: null, style: {} })),
  addRow:    jest.fn(),
  mergeCells: jest.fn(),
  // Spec: SC-001 — el código real usa sheet.headerFooter.oddFooter para el pie
  // de página; nunca se había ejercitado (mismo patrón del hallazgo de HU-012
  // sobre new ExcelJS.Workbook()).
  headerFooter: { oddHeader: '', oddFooter: '' },
}

const mockWorkbook = {
  addWorksheet: jest.fn(() => mockSheet),
  xlsx:         { writeBuffer: jest.fn().mockResolvedValue(Buffer.from('XLSX')) },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ExcelJSDefault: any = jest.fn(() => mockWorkbook)
// Spec: HU-012 — el código real usa `new ExcelJS.Workbook()`, no `new ExcelJS()`.
// Nunca se había ejercitado (los tests previos de exportación solo cubrían 401).
ExcelJSDefault.Workbook = jest.fn(() => mockWorkbook)

export default ExcelJSDefault
