import '@testing-library/jest-dom'

window.API = {
  saveTheme: jest.fn(),
  saveDatabase: jest.fn(),
  selectFolder: jest.fn().mockImplementation(() => Promise.resolve()),
  dbFileExists: jest.fn(() => { return true }),
  sendToDB: jest.fn((param) => { if(param == 'SELECT MAX(ID) as ID FROM assets') return [{ID: 1}] }),
  sendToFinanceAPI: jest.fn(),
  quit: jest.fn()
}