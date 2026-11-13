// Janela do app no Mac/PC: liga a ponte (ECU) dentro do próprio app e abre a tela.
import { app, BrowserWindow, powerSaveBlocker, shell } from 'electron';

// Modo painel (tela de 7" no carro, ex. Raspberry Pi): tela cheia, sem janela, liga sozinho na ECU pelo USB.
// Abre com "ECU --painel" (o instalador do Raspberry Pi já põe assim). "--cursor" mostra o ponteiro do mouse.
const painel = process.argv.includes('--painel') || process.env.ECU_PAINEL === '1';
if (painel) process.env.ECU_PAINEL = '1';

if (!app.requestSingleInstanceLock()) app.quit();
process.env.ECU_ROOT ??= app.getAppPath();
process.env.ECU_VERSION ??= app.getVersion();
process.env.PORT ??= '0'; // porta livre qualquer, só para dentro do app

const { ready } = await import('../build/bridge.mjs');
const port = await ready;

let win;
function open() {
  if (painel) {
    powerSaveBlocker.start('prevent-display-sleep');
    win = new BrowserWindow({ width: 1024, height: 600, fullscreen: true, kiosk: true, frame: false, backgroundColor: '#000000', title: 'ECU' });
    win.loadURL(`http://127.0.0.1:${port}/?painel${process.argv.includes('--cursor') ? '' : '&semcursor'}`);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    return;
  }
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
