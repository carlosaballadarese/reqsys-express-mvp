const mockSheet = {
  columns: [],
  getRow:    jest.fn(() => ({ getCell: jest.fn(() => ({ value: null, style: {} })), height: 0 })),
  getCell:   jest.fn(() => ({ value: null, style: {} })),
  addRow:    jest.fn(),
  mergeCells: jest.fn(),
}

const mockWorkbook = {
  addWorksheet: jest.fn(() => mockSheet),
  xlsx:         { writeBuffer: jest.fn().mockResolvedValue(Buffer.from('XLSX')) },
}

export default jest.fn(() => mockWorkbook)
