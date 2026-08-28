import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;

async function start() {
  await import(path.join(root, '..', 'server', 'dist', 'index.js'));
  await new Promise((resolve) => setTimeout(resolve, 350));
  mainWindow = new BrowserWindow({ width: 1440, height: 920, minWidth: 1024, minHeight: 700, autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await mainWindow.loadFile(path.join(root, '..', 'dist', 'index.html'));
}

app.whenReady().then(start);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });