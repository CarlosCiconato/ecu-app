// Ponte entre a tela (navegador ou janela do Electron) e a ECU.
// Fala com a tela por WebSocket e com a ECU por rede (simulador) ou, mais tarde, USB.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseIni } from '../core/ini.js';
import { EcuSession, listSerialPorts } from './ecu.js';
import { guardarIni, assinaturaDoTexto } from '../core/biblioteca.js';

const root = process.env.ECU_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const iniPath = process.env.ECU_INI ?? path.join(root, 'ini/simulador.ini');
const port = Number(process.env.PORT ?? 8600);
const ini = parseIni(fs.readFileSync(iniPath, 'latin1'));
// Pasta dos arquivos do usuário (mapas e logs), como a tela inicial dos programas profissionais.
const userDir = process.env.ECU_FILES ?? path.join(os.homedir(), 'Documents', 'ECU Arquivos');
// .ini de outras ECUs: a biblioteca vem com o app (ini/biblioteca); os baixados e escolhidos ficam com o usuário.
const iniCache = path.join(userDir, 'ini');
const ecu = new EcuSession(ini, { app: path.dirname(iniPath), cache: iniCache });
console.log(`[ponte] .ini: ${path.basename(iniPath)} · assinatura ${ini.signature}`);
const KINDS: Record<string, string> = { mapas: 'Mapas', logs: 'Logs' };
function kindDir(kind: string) {
  const d = path.join(userDir, KINDS[kind] ?? 'Outros');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const safeName = (n: string) => path.basename(n).replace(/[\\/:*?"<>|]/g, '_');
function listFiles() {
  return Object.keys(KINDS).flatMap((kind) => fs.readdirSync(kindDir(kind)).filter((f) => !f.startsWith('.')).map((name) => {
    const st = fs.statSync(path.join(kindDir(kind), name));
    return { kind, name, size: st.size, mtime: st.mtimeMs };
  })).sort((a, b) => b.mtime - a.mtime);
}

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml',
};
const dist = path.join(root, 'dist');
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.normalize(path.join(dist, url === '/' ? 'index.html' : url));
  if (!file.startsWith(dist) || !fs.existsSync(file)) file = path.join(dist, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('Rode "npm run build" antes.'); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const WRITE_OPS = new Set(['setCells', 'setBits', 'setValue', 'setArray', 'zeroTune', 'copyTune', 'ftmApply', 'mapaPadrao']);
const wss = new WebSocketServer({ server, path: '/ws' });
const subs = new Map<WebSocket, string[]>();
const send = (ws: WebSocket, msg: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
const broadcast = (msg: unknown) => wss.clients.forEach((c) => send(c, msg));

ecu.on('status', (s) => broadcast({ type: 'status', status: s }));
let lastLive = 0;
ecu.on('live', () => {
  const now = Date.now();
  if (now - lastLive < 45) return;
  lastLive = now;
  for (const [ws, names] of subs) if (names.length) send(ws, { type: 'live', values: ecu.liveValues(names) });
});

wss.on('connection', (ws) => {
  subs.set(ws, []);
  send(ws, { type: 'status', status: ecu.status });
  ws.on('close', () => subs.delete(ws));
  ws.on('message', async (raw) => {
    let msg: { id?: number; op: string; [k: string]: unknown };
    try { msg = JSON.parse(String(raw)); } catch { return; }
    const reply = (result: unknown) => send(ws, { type: 'reply', id: msg.id, result });
    const fail = (e: unknown) => send(ws, { type: 'reply', id: msg.id, error: (e as Error).message });
    try {
      if (WRITE_OPS.has(msg.op) && ecu.status.state === 'conectado') ecu.snapshot();
      switch (msg.op) {
        case 'connect':
          reply(true);
          await ecu.connect(String(msg.host ?? '127.0.0.1'), Number(msg.port ?? 29001));
          break;
        case 'mapSave': {
          const nome = String(msg.name || 'Meu mapa').replace(/\.ecumap$/i, '');
          const f = path.join(kindDir('mapas'), safeName(`${nome}.ecumap`));
          fs.writeFileSync(f, JSON.stringify(ecu.exportMap(nome), null, 1));
          reply(path.basename(f));
          break;
        }
        case 'mapLoad': {
          const file = path.join(kindDir('mapas'), safeName(String(msg.name || 'Mapa aberto.ecumap')));
          const raw = msg.data ? Buffer.from(String(msg.data), 'base64').toString('utf8') : fs.readFileSync(file, 'utf8');
          if (ecu.status.state !== 'conectado' || ecu.status.offline) {
            // sem ECU: abre o arquivo para editar (um mapa vindo do PC passa a ficar na pasta Mapas)
            if (msg.data && !fs.existsSync(file)) fs.writeFileSync(file, raw);
            ecu.openOffline(JSON.parse(raw), file);
          } else await ecu.importMap(JSON.parse(raw));
          reply(true);
          break;
        }
        case 'undo': await ecu.undo(); reply(true); break;
        case 'cancel': await ecu.cancel(); reply(true); break;
        case 'files': reply({ dir: userDir, files: listFiles() }); break;
        case 'readFile': reply(fs.readFileSync(path.join(kindDir(String(msg.kind)), safeName(String(msg.name)))).toString('base64')); break;
        case 'saveFile': {
          const f = path.join(kindDir(String(msg.kind)), safeName(String(msg.name)));
          fs.writeFileSync(f, Buffer.from(String(msg.data), 'base64'));
          reply(path.basename(f));
          break;
        }
        case 'deleteFile': fs.rmSync(path.join(kindDir(String(msg.kind)), safeName(String(msg.name))), { force: true }); reply(true); break;
        case 'openFolder': spawn(process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open', [msg.kind ? kindDir(String(msg.kind)) : userDir], { detached: true, stdio: 'ignore' }).unref(); reply(true); break;
        case 'serialPorts': reply(await listSerialPorts()); break;
        case 'connectSerial':
          reply(true);
          await ecu.connectSerial(String(msg.path));
          break;
        case 'iniArquivo': {
          // O usuário escolheu o .ini da ECU dele: guarda e tenta conectar de novo.
          const texto = Buffer.from(String(msg.data), 'base64').toString('latin1');
          if (!assinaturaDoTexto(texto)) throw new Error('Este arquivo não parece um .ini do TunerStudio (não tem "signature").');
          guardarIni(iniCache, texto);
          reply(assinaturaDoTexto(texto));
          await ecu.reconnect();
          break;
        }
        case 'demo': ecu.connectDemo(); reply(true); break;
        case 'disconnect': ecu.disconnect(); reply(true); break;
        case 'subscribe': subs.set(ws, (msg.names as string[]) ?? []); reply(true); break;
        case 'table': reply(ecu.table(String(msg.name))); break;
        case 'existe': reply(ecu.existe((msg.names as string[]) ?? [])); break;
        case 'tabelasIni': reply(ecu.tabelasDoIni()); break;
        case 'funcoesIni': reply(ecu.funcoesIni()); break;
        case 'dialogoIni': reply(ecu.dialogoIni(String(msg.alvo))); break;
        case 'curvaIni': reply(ecu.curvaIni(String(msg.alvo))); break;
        case 'calibracaoIni': reply(ecu.calibracaoIni(String(msg.alvo))); break;
        case 'calibrar': reply(await ecu.calibrar(String(msg.alvo), Number(msg.tabela), (msg.p ?? {}) as Parameters<typeof ecu.calibrar>[2])); break;
        case 'condicoes': reply(ecu.condicoes((msg.exprs as string[]) ?? [])); break;
        case 'constants': reply(Object.fromEntries((msg.names as string[]).map((n) => [n, ecu.constant(n) ?? null]))); break;
        case 'setCells': reply(await ecu.setCells(String(msg.name), msg.cells as { index: number; value: number }[])); break;
        case 'setBits': await ecu.setBits(String(msg.name), Number(msg.value)); reply(true); break;
        case 'setValue': reply(await ecu.setValue(String(msg.name), Number(msg.value))); break;
        case 'zeroTune': await ecu.zeroTune(Number(msg.n)); reply(true); break;
        case 'copyTune': await ecu.copyTune(Number(msg.from), Number(msg.to)); reply(true); break;
        case 'setArray': reply(await ecu.setArray(String(msg.name), msg.cells as { index: number; value: number }[])); break;
        case 'password': await ecu.password(String(msg.action), Number(msg.entry ?? 0), Number(msg.newPin ?? 0), Number(msg.locks ?? 0)); reply(true); break;
        case 'options': reply(ecu.options(String(msg.name))); break;
        case 'ftmRead': reply(ecu.ftmRead(String(msg.data))); break;
        case 'ftmApply': reply(await ecu.ftmApply((msg.keys as string[]) ?? [])); break;
        case 'ftmExport': {
          if (!msg.template) throw new Error('Escolha um arquivo .ftm de modelo para exportar.');
          const tpl = String(msg.template);
          reply(ecu.ftmExport(tpl, String(msg.name ?? '')));
          break;
        }
        case 'mapaPadrao': reply(await ecu.mapaPadrao(msg.p as { rpmMax: number; mapMax: number; fuel: number; compression: number; cam: number })); break;
        case 'cmd': await ecu.command(String(msg.name)); reply(true); break;
        case 'burn': await ecu.burn(); reply(true); break;
        default: fail(new Error(`comando desconhecido ${msg.op}`));
      }
    } catch (e) { fail(e); }
  });
});

export const ready = new Promise<number>((ok) => server.once('listening', () => ok((server.address() as { port: number }).port)));
server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log(`[ponte] abra http://localhost:${port}`));
if (process.env.DEMO) ecu.connectDemo();
else if (process.env.AUTO_CONNECT) {
  const [h, p] = process.env.AUTO_CONNECT.split(':');
  void ecu.connect(h, Number(p ?? 29001));
}
