import { app, BrowserWindow } from 'electron';
import { io } from 'socket.io-client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;

async function start() {
  await import(path.join(root, '..', 'server', 'dist', 'index.js'));
  await new Promise((resolve) => setTimeout(resolve, 350));
  mainWindow = new BrowserWindow({ width: 1440, height: 920, minWidth: 1024, minHeight: 700, autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await mainWindow.loadFile(path.join(root, '..', 'dist', 'index.html'));
  const socket = io('http://127.0.0.1:3001');
  socket.on('capture-dashboard-report', async ({ schedule }) => {
    await mainWindow.webContents.executeJavaScript("window.dispatchEvent(new Event('show-dashboard-for-report'))");
    await new Promise((resolve) => setTimeout(resolve, 900));
    const image = await mainWindow.webContents.capturePage();
    const form = new FormData();
    form.append('screenshot', new Blob([image.toPNG()], { type: 'image/png' }), 'wiser-dashboard.png');
    form.append('recipients', schedule.recipients.join(','));
    await fetch('http://127.0.0.1:3001/api/reports/scheduled-email', { method: 'POST', body: form });
  });
}

app.whenReady().then(start);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });