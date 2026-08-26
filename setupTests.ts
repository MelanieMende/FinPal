import '@testing-library/jest-dom'

window.API = {
  getConfig: jest.fn(),
  saveTheme: jest.fn(),
  saveDatabase: jest.fn(),
  selectFolder: jest.fn().mockImplementation(() => Promise.resolve()),
  dbFileExists: jest.fn(() => { return true }),
  sendToDB: jest.fn((param) => { if(param == 'SELECT MAX(ID) as ID FROM assets') return [{ID: 1}] }),
  sendToYahooFinanceAPI: jest.fn(),
  sendToDivvyDiaryAPI: jest.fn(),
  openFiles: jest.fn().mockResolvedValue([]),
  parsePDF: jest.fn().mockResolvedValue(''),
  getPathForFile: jest.fn().mockReturnValue(''),
  quit: jest.fn()
}
