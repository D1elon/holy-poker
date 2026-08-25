// ============ HOLY POKER — desktop launcher (Electron) ============
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

Menu.setApplicationMenu(null);

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#07030f',
    autoHideMenuBar: true,
    title: 'Holy Poker',
    icon: path.join(__dirname, 'build', 'icon.png'), // dev runs; packaged exe carries its own icon
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');

  // F11 fullscreen toggle, Esc leaves fullscreen (game also uses Esc for pause,
  // so only intercept it when actually fullscreen via F11)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
