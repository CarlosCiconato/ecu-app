// Janela do app no Mac/PC: liga a ponte (ECU) dentro do próprio app e abre a tela.
import { app, BrowserWindow, shell } from 'electron';

if (!app.requestSingleInstanceLock()) app.quit();
process.env.ECU_ROOT ??= app.getAppPath();
process.env.PORT ??= '0'; // porta livre qualquer, só para dentro do app

const { ready } = await import('../build/bridge.mjs');
const port = await ready;

let win;
function open() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#0E0F11', title: 'ECU', autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 15 } } : {}),
  });
  win.loadURL(`http://127.0.0.1:${port}/?desktop`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    // função aberta em outra janela (abas): fica dentro do app
    if (url.startsWith(`http://127.0.0.1:${port}/`)) return { action: 'allow', overrideBrowserWindowOptions: { backgroundColor: '#0E0F11', autoHideMenuBar: true, minWidth: 700, minHeight: 500 } };
    void shell.openExternal(url); return { action: 'deny' };
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(open);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) open(); });
app.on('window-all-closed', () => app.quit());
