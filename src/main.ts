import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'fs';
import started from 'electron-squirrel-startup';
import installExtension, { REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

// Keep a reference for dev mode
let dev = false
if (!app.isPackaged) {
  dev = true
  console.log("Executing in DEV mode!\n");
}
else {
  console.log("Executed in PROD mode!\n");
}

const dataPath = app.getPath('userData');
const filePath = path.join(dataPath, 'config.json');

let appState: {
  dataPath: string;
  filePath: string;
  selectedTab: string;
  theme: string;
  database: string;
  transactions_AssetFilter: number[];
} = {
  dataPath: dataPath,
  filePath: filePath,
  selectedTab: "",
  theme: "",
  database: "",
  transactions_AssetFilter: []
}

if(fs.existsSync(filePath)) {

  let result = fs.readFileSync( filePath, { encoding: 'utf8', flag: 'r' } )

  if(result) {
    try {
      console.log("Parsing file " + filePath + " ...\n")
      appState = JSON.parse(result)
      appState.dataPath = dataPath
      appState.filePath = filePath
      console.log(appState)
      console.log("\n")
    } catch (e) {
      console.log("JSON.parse of " + filePath + " failed.")
    }
  }
  else {
    console.log('Config file ' + filePath + ' is empty.')
  }
}
else {
  console.log('Config file ' + filePath + ' does not exist.')
}

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Don't show until we are ready and loaded
  mainWindow.once('ready-to-show', () => {

    mainWindow.show()
    // Open the DevTools automatically if developing
    if (dev) {
      mainWindow.webContents.on('did-frame-finish-load', () => {
        mainWindow.webContents.openDevTools();
        mainWindow.webContents.once('devtools-opened', () => {
          mainWindow.focus();
        });
      });
    }
  })
    
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
    })
    if (canceled) {
      return
    } else {
      return filePaths[0]
    }
  })
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  console.log("Installing devtools extensions...\n");
  await installExtension([REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS])
    .then(([redux, react]) => {
      console.log(`Added Extension: ${redux.name}, ${react.name}`)
    })
    .catch((err) => console.log('An error occurred: ', err));
}).then(createWindow).catch(console.log);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
ipcMain.on('check-if-db-file-exists', (event, arg) => {
  if(fs.existsSync(appState.database)) {
    event.reply('check-if-db-file-exists', true);
  }
  else {
    event.reply('check-if-db-file-exists', false);
  }

});

ipcMain.handle('get-config', async (event) => {
  console.log('get-config called in main process with filePath:', filePath);
  return appState
})

ipcMain.on('save-selected-tab', (event, arg) => {
  Object.assign(appState, { selectedTab: arg });
  console.log("Saving selectedTab: " + arg);
  fs.writeFileSync( filePath, JSON.stringify(appState))
  return event.reply('save-selected-tab', true);
});

ipcMain.on('save-transactions-assetfilter', (event, arg) => {
  Object.assign(appState, { transactions_AssetFilter: arg.assetIDs });
  console.log("Saving transactions asset-filter: " + arg.assetIDs);
  fs.writeFileSync( filePath, JSON.stringify(appState))
  return event.reply('save-selected-tab', true);
});

const sqlite3 = require('sqlite3').verbose();

ipcMain.on('async-db-message', (event, arg) => {
  const sql = arg;
  console.log("\nReceived SQL command:\n" + sql); 
  const database = new sqlite3.Database(appState.database, (err:any) => {
    if (err) console.error('Database opening error: ', err);
  });
  
  database.all(sql, (err:any, rows:any) => {
    if(err && err.message) {
			console.error(err.message)
		}
    event.reply('async-db-reply', (err && err.message) || rows);
  });
  database.close()
});

import YahooFinance from 'yahoo-finance2';

ipcMain.on('finance-api-message', (event, args) => {
  const yf = new YahooFinance();
  yf.quoteSummary(args.symbol).then((result) => {
    event.reply('finance-api-reply', result);
  }).catch((reason) => console.log('ERROR: finance-api-message: ', reason));
});
