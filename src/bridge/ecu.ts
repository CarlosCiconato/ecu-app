// Sessão com a ECU: conecta, confere a assinatura, lê a configuração inteira
// e lê os canais ao vivo várias vezes por segundo.
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { TsClient, detectSignature, type Transport } from '../core/protocol.js';
import { acharIni } from '../core/biblioteca.js';
import { SPEEDUINO_CANAIS, SPEEDUINO_LISTAS, SPEEDUINO_PC, SPEEDUINO_TABELAS } from '../core/traducao.js';
import { ptOpcao, ptRotulo } from '../core/rotulos-pt.js';
import { bytesLinear, bytesTemperatura, comandosCalibracao, curvaLinear, curvaTermistor, SONDAS } from '../core/calibracao.js';
import { TYPE_SIZE, parseIni, type ArrayField, type Ini } from '../core/ini.js';
import { decodeArray, decodeBits, decodeField, decodeScalar, encodeArray, encodeBits, encodeScalar } from '../core/codec.js';
import { DemoEngine, demoPage } from './demo.js';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { FT_LINKS, ftMainLoad, ftName, intAxis, lookup, pickAxis, readFtTable, setFtName, writeFtTable, type FtLink, type FtTable } from '../core/ftm.js';

/** Campos da tela pronta "std_injection" do TunerStudio (a Speeduino usa em Engine Constants). */
const STD_INJECTION: [string, string][] = [
  ['reqFuel', 'Combustível requerido (Required Fuel)'], ['algorithm', 'Algoritmo de controle'], ['divider', 'Injeções por ciclo do motor'], ['alternate', 'Modo dos bicos'],
  ['twoStroke', 'Ciclo do motor'], ['nCylinders', 'Número de cilindros'], ['injType', 'Tipo de injeção'], ['nInjectors', 'Número de bicos'], ['engineType', 'Tipo de motor'],
];

const PW_CMDS: Record<string, number> = {
  unlockUser: 0x2e, unlockTuner: 0x2f, unlockMaintenance: 0x30, setUser: 0x31, setTuner: 0x32, setMaintenance: 0x33, lockAll: 0x34,
};

export function tcpTransport(host: string, port: number): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    const onErr = (e: Error) => reject(e);
    sock.once('error', onErr);
    sock.once('connect', () => {
      sock.off('error', onErr);
      sock.setNoDelay(true);
      resolve({
        write: (d) => sock.write(d),
        onData: (cb) => sock.on('data', (d: Buffer) => cb(new Uint8Array(d))),
        onClose: (cb) => {
          sock.on('close', () => cb());
          sock.on('error', (e) => cb(e));
        },
        close: () => sock.destroy(),
      });
    });
  });
}

/** Registro da conversa com a ECU (bytes enviados e recebidos), para achar defeito de conexão à distância. */
export class RegistroConexao {
  linhas: string[] = [];
  parado = false;
  private t0 = Date.now();
  constructor(private arquivo?: string) {}
  add(tipo: string, d?: Uint8Array | string) {
    if (this.parado || this.linhas.length > 600) return;
    const ms = String(Date.now() - this.t0).padStart(6);
    let txt = '';
    if (typeof d === 'string') txt = d;
    else if (d) {
      const b = d.subarray(0, 96);
      txt = `${d.length} B  ${Buffer.from(b).toString('hex').replace(/(..)/g, '$1 ').trim()}${d.length > 96 ? ' …' : ''}  |${Array.from(b, (x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')}|`;
    }
    this.linhas.push(`${ms} ms  ${tipo}  ${txt}`);
    this.salvar();
  }
  salvar() {
    if (!this.arquivo) return;
    try { fs.mkdirSync(path.dirname(this.arquivo), { recursive: true }); fs.writeFileSync(this.arquivo, this.linhas.join('\n') + '\n'); } catch { /* sem registro */ }
  }
}

/** Transporte que anota no registro tudo o que passa. */
export function comRegistro(t: Transport, r: RegistroConexao): Transport {
  // Uma só inscrição no transporte de verdade, repassada a todos os clientes.
  const ouvintes: ((d: Uint8Array) => void)[] = [];
  t.onData((d) => { r.add('<-', d); for (const cb of ouvintes) cb(d); });
  return {
    write: (d) => { r.add('->', d); t.write(d); },
    onData: (cb) => { ouvintes.push(cb); },
    onClose: (cb) => t.onClose((e) => { r.add('fechou', e ? String((e as Error).message ?? e) : ''); cb(e); }),
    close: () => t.close(),
  };
}

/** Cabo USB: a placa rusEFI aparece como porta serial (CDC); o protocolo é o mesmo da rede. */
export async function serialTransport(path: string): Promise<Transport> {
  const { SerialPort } = await import('serialport');
  return new Promise((resolve, reject) => {
    const sp = new SerialPort({ path, baudRate: 115200, autoOpen: false });
    sp.open((err) => {
      if (err) return reject(err);
      resolve({
        write: (d) => { sp.write(Buffer.from(d)); },
        onData: (cb) => sp.on('data', (d: Buffer) => cb(new Uint8Array(d))),
        onClose: (cb) => {
          sp.on('close', () => cb());
          sp.on('error', (e: Error) => cb(e));
        },
        close: () => { if (sp.isOpen) sp.close(); },
      });
    });
  });
}

/** Portas seriais do computador (as de USB primeiro). */
export async function listSerialPorts() {
  const { SerialPort } = await import('serialport');
  const ports = await SerialPort.list();
  return ports
    .filter((p) => !/Bluetooth|BLTH|debug-console/i.test(p.path))
    .map((p) => ({ path: p.path.replace('/dev/tty.', '/dev/cu.'), label: [p.manufacturer, p.serialNumber].filter(Boolean).join(' · ') || p.path }))
    .filter((p, i, a) => a.findIndex((q) => q.path === p.path) === i);
}

export interface EcuStatus {
  state: 'desconectado' | 'conectando' | 'lendo' | 'conectado' | 'erro';
  message?: string;
  ecuSignature?: string;
  iniSignature: string;
  signatureMatch?: boolean;
  progress?: number; // 0..1 enquanto lê a configuração
  dirty: boolean; // há mudanças não gravadas na flash
  demo?: boolean; // ECU falsa do modo demonstração
  undo?: number; // quantas mudanças dá para desfazer
  offline?: string; // mapa aberto sem ECU: nome do arquivo
  rev?: number; // muda quando a configuração volta (desfazer/cancelar): a tela relê as tabelas
  family?: 'rusefi' | 'speeduino' | 'outra'; // qual ECU está conectada: a tela mostra só o que ela tem
  iniFonte?: string; // de onde veio o .ini: app, guardado, biblioteca, baixado, parecido
  faltaIni?: boolean; // a ECU respondeu mas não achamos o .ini dela: a tela pede o arquivo
}

export interface PastasIni {
  app: string; // ini/ do app (com a biblioteca da Speeduino)
  cache: string; // .ini baixados e escolhidos pelo usuário
}

/** Nº de cilindros de uma ordem de ignição do .ini ("1-3-4-2" = 4). Personalizada/inválida = undefined (vale qualquer). */
export function ordemCilindros(label?: string): number | undefined {
  if (!label || /INVALID|^Custom/i.test(label)) return undefined;
  if (label === 'One Cylinder') return 1;
  return label.split(' ')[0].split(/[-_]/).length;
}

export class EcuSession extends EventEmitter {
  private client?: TsClient;
  private transport?: Transport;
  private page1?: Uint8Array;
  private pages = new Map<number, Uint8Array>(); // outras páginas (ex.: 3 = correção de longo prazo)
  private outputs?: Uint8Array;
  private pollTimer?: NodeJS.Timeout;
  private demo?: DemoEngine;
  private demoSaved?: Uint8Array; // "flash" da ECU falsa
  private flash?: Uint8Array; // configuração como está gravada na ECU (para Cancelar)
  private history: Uint8Array[] = []; // fotos antes de cada mudança (para Desfazer)
  private rev = 0;
  private offlinePath?: string; // arquivo do mapa aberto sem ECU (Salvar grava nele)
  private canWrite() { return !!(this.client || this.demo || this.offlinePath); }

  /** Abre um mapa .ecumap sem ECU conectada (como os programas profissionais): dá para ver, editar e salvar no arquivo. */
  openOffline(m: { formato?: string; assinatura?: string; pagina1?: string; nome?: string }, filePath: string) {
    if (m.formato !== 'ecu-mapa' || !m.pagina1) throw new Error('Este arquivo não é um mapa do app.');
    if (m.assinatura === this.iniPadrao.signature) this.usarIniPadrao();
    if (m.assinatura !== this.ini.signature) throw new Error(`O mapa é de outro firmware (${m.assinatura}); o app está com ${this.ini.signature}.`);
    this.disconnect();
    this.page1 = new Uint8Array(Buffer.from(m.pagina1, 'base64'));
    this.outputs = new Uint8Array(this.ini.ochBlockSize);
    this.pages.clear();
    this.offlinePath = filePath;
    this.flash = this.page1.slice(); this.history = [];
    const nome = path.basename(filePath);
    this.setStatus({ state: 'conectado', offline: nome, demo: false, ecuSignature: m.assinatura, signatureMatch: true, progress: 1, dirty: false, undo: 0,
      message: `Mapa aberto sem ECU: ${nome}. Salvar grava no arquivo.`, rev: ++this.rev });
  }
  status: EcuStatus;

  private iniPadrao: Ini; // .ini do nosso firmware (demonstração e mapas sem ECU)

  constructor(public ini: Ini, private pastas?: PastasIni) {
    super();
    this.iniPadrao = ini;
    this.status = { state: 'desconectado', iniSignature: ini.signature, dirty: false, family: ini.family };
  }

  /** Volta para o .ini do nosso firmware (modo demonstração, mapa sem ECU). */
  private usarIniPadrao() {
    if (this.ini === this.iniPadrao) return;
    this.ini = this.iniPadrao;
    this.setStatus({ iniSignature: this.ini.signature, family: this.ini.family, iniFonte: 'app' });
  }

  private setStatus(s: Partial<EcuStatus>) {
    this.status = { ...this.status, ...s };
    this.emit('status', this.status);
  }

  connect(host: string, port: number) {
    return this.connectWith(`${host}:${port}`, () => tcpTransport(host, port));
  }

  connectSerial(path: string) {
    return this.connectWith(path, () => serialTransport(path), true);
  }

  /** Liga com um transporte já aberto (testes com a Speeduino falsa). */
  connectTransport(label: string, t: Transport, serial = false) {
    return this.connectWith(label, async () => t, serial);
  }

  private lastConnect?: () => Promise<void>;
  /** Tenta de novo a última conexão (depois que o usuário escolheu o .ini). */
  reconnect() { return this.lastConnect?.(); }

  private async connectWith(label: string, open: () => Promise<Transport>, serial = false) {
    this.disconnect();
    this.lastConnect = () => this.connectWith(label, open, serial);
    this.setStatus({ state: 'conectando', message: label, progress: undefined, dirty: false, demo: false, faltaIni: false });
    const arqReg = this.pastas ? path.join(path.dirname(this.pastas.cache), 'conexao-log.txt') : undefined;
    const reg = new RegistroConexao(arqReg);
    reg.add('inicio', `${label} · ${process.platform} · app ${process.env.ECU_VERSION ?? process.env.npm_package_version ?? ''}`);
    try {
      const bruto = await open();
      reg.add('abriu');
      this.transport = comRegistro(bruto, reg);
      this.client = new TsClient(this.transport);
      this.transport.onClose(() => {
        // Só é "caiu" se já estava ligada; se fomos nós que fechamos por um erro, a mensagem do erro fica.
        if (this.status.state === 'conectado' || this.status.state === 'lendo') this.setStatus({ state: 'erro', message: 'A conexão com a ECU caiu' });
        this.stopPolling();
      });
      // Ao religar, o simulador (e talvez a placa) ainda manda a resposta de um pedido da conexão
      // anterior, que vinha sendo lida como assinatura (achado no simulador real). Espera ela passar.
      // Pelo cabo, a Speeduino (Arduino Mega) reinicia quando a porta abre e fica uns 2 s surda:
      // tenta de novo algumas vezes antes de desistir.
      // O Arduino Mega fica ~1,5 s no bootloader e depois a Speeduino ainda inicia: não fala nada nesse tempo
      // (bytes mandados ao bootloader só atrasam a partida). O TunerStudio espera 1 s (delayAfterPortOpen).
      if (serial) this.setStatus({ message: `${label}: esperando a ECU reiniciar…` });
      await new Promise((r) => setTimeout(r, serial ? 2500 : 250));
      let det: Awaited<ReturnType<typeof detectSignature>>;
      const tentativas = serial ? 6 : 3;
      for (let i = 0; i < tentativas; i++) {
        reg.add('tentativa', String(i + 1));
        det = await detectSignature(this.transport, serial ? 1500 : 1000);
        if (det) break;
        // O bootloader do Arduino Mega fica preso enquanto recebe bytes (só sai depois de ~5,5 s de silêncio).
        // Se falamos cedo demais, ele nunca chega no firmware: nas tentativas ímpares fica 7 s calado.
        const silencio = !serial ? 400 : i % 2 === 0 ? 7000 : 1000;
        this.setStatus({ message: `${label}: esperando a ECU responder… (${i + 1}/${tentativas})${silencio > 1000 ? ' Aguarde uns 10 s.' : ''}` });
        reg.add('silencio', `${silencio} ms`);
        await new Promise((r) => setTimeout(r, silencio));
      }
      if (!det!) throw new Error(`A ECU não respondeu. Confira o cabo, a porta escolhida, se a ECU está ligada e se o TunerStudio está fechado.${arqReg ? ` Registro da conversa: ${arqReg}` : ''}`);
      reg.add('assinatura', `${det.signature} · envelope ${det.envelope}`);
      const sig = det.signature;
      this.client = new TsClient(this.transport);
      // Acha o .ini desta ECU: o nosso, a biblioteca (Speeduino), os guardados ou o servidor da rusEFI.
      let fonte = 'app';
      let aviso: string | undefined;
      if (sig !== this.ini.signature) {
        const achado = sig === this.iniPadrao.signature ? { texto: '', fonte: 'app' as const }
          : this.pastas ? await acharIni(sig, { pastaApp: this.pastas.app, pastaCache: this.pastas.cache }) : undefined;
        if (!achado) {
          this.setStatus({ ecuSignature: sig, signatureMatch: false, faltaIni: true, state: 'erro',
            message: `Não achei o arquivo .ini do firmware "${sig}". Escolha o .ini da sua ECU (o mesmo que o TunerStudio usa) e o app guarda para as próximas vezes.` });
          this.transport.close();
          return;
        }
        this.ini = achado.texto ? parseIni(achado.texto) : this.iniPadrao;
        fonte = achado.fonte;
        aviso = achado.aviso;
      }
      // O .ini diz se esta versão usa envelope (a Speeduino nova também responde ao 'Q' cru,
      // então a detecção sozinha pode enganar).
      this.client.useIni(this.ini);
      reg.add('ini', `${this.ini.signature} (${fonte}) envelope ${this.ini.comms.envelope}`);
      this.setStatus({ ecuSignature: sig, signatureMatch: true, iniSignature: this.ini.signature, family: this.ini.family, iniFonte: fonte, faltaIni: false, message: aviso });
      this.setStatus({ state: 'lendo', progress: 0 });
      this.page1 = await this.client.readPage(this.ini, 1, (d, t) => this.setStatus({ progress: d / t }));
      this.pages.clear();
      await this.readExtraPages();
      this.flash = this.page1.slice(); this.history = [];
      this.resolverExpressoes();
      this.setStatus({ state: 'conectado', progress: 1, message: aviso, undo: 0 });
      reg.add('conectado', `.ini ${this.ini.signature} (${fonte})`);
      reg.parado = true; // daqui em diante só leituras ao vivo: não precisa anotar
      this.startPolling();
    } catch (e) {
      reg.add('erro', (e as Error).stack ?? String(e));
      const m = (e as Error).message;
      this.setStatus({ state: 'erro', message: m.includes('Registro da conversa') || !arqReg ? m : `${m} (registro: ${arqReg})` });
      this.transport?.close();
    }
  }

  /** Liga na ECU falsa do modo demonstração (sem simulador e sem placa). */
  connectDemo() {
    this.disconnect();
    this.usarIniPadrao();
    this.page1 = this.demoSaved ? this.demoSaved.slice() : demoPage(this.ini);
    this.outputs = new Uint8Array(this.ini.ochBlockSize);
    this.demo = new DemoEngine(this.ini);
    this.pages.clear();
    const lp = this.ini.pages.find((p) => p.number === 3);
    if (lp) this.pages.set(3, this.demo.ltftPage(lp.size));
    this.flash = this.page1.slice(); this.history = [];
    this.setStatus({ undo: 0 });
    this.setStatus({ state: 'conectado', demo: true, ecuSignature: this.ini.signature, signatureMatch: true, progress: 1, dirty: false,
      message: 'Modo demonstração: ECU falsa, os valores são de exemplo.' });
    const tick = () => {
      if (!this.demo || !this.page1 || !this.outputs) return;
      this.demo.step(this.page1, this.outputs);
      this.emit('live');
      this.pollTimer = setTimeout(tick, 50);
    };
    tick();
  }

  disconnect() {
    this.demo = undefined;
    this.offlinePath = undefined;
    this.stopPolling();
    this.transport?.close();
    this.transport = undefined;
    this.client = undefined;
    this.setStatus({ state: 'desconectado', message: undefined, progress: undefined, demo: false, offline: undefined });
  }

  private startPolling() {
    const tick = async () => {
      if (!this.client || this.client.closed) return;
      try {
        this.outputs = await this.client.readOutputs(0, this.ini.ochBlockSize, this.ini);
        this.emit('live');
      } catch { /* uma leitura perdida não derruba a conexão */ }
      this.pollTimer = setTimeout(tick, 50); // ~20 leituras por segundo
    };
    void tick();
  }

  private stopPolling() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
  }

  /** Valor de uma configuração (página 1). */
  constant(name: string): number | number[] | undefined {
    if (this.ini.pcVars.has(name)) return this.locais.get(name) ?? 0;
    const f = this.ini.constants.get(name);
    if (!f || !this.page1 || f.page !== 1) return undefined;
    return decodeField(this.page1, f);
  }

  /** Valor de um canal ao vivo, incluindo os calculados ({ a ? b : c }). */
  live(name: string, depth = 0): number | undefined {
    // Sem canais ainda, só a Speeduino calcula (as escalas dos eixos dependem de contas do .ini).
    if (!this.outputs && this.ini.family !== 'speeduino') return undefined;
    const f = this.ini.outputs.get(name);
    if (f) return !this.outputs ? undefined : f.kind === 'bits' ? decodeBits(this.outputs, f) : decodeScalar(this.outputs, f);
    const expr = this.ini.expressions.get(name);
    if (expr && depth < 4) return this.evaluate(expr, depth + 1);
    if (this.ini.family === 'speeduino') {
      if (name in SPEEDUINO_PC) return SPEEDUINO_PC[name];
      const alias = SPEEDUINO_CANAIS[name];
      if (alias && depth < 4) return this.evaluate(alias, depth + 1);
    }
    return undefined;
  }

  /** Escalas e unidades que dependem de outras configurações (Speeduino: eixo de carga em kPa ou % TPS).
   *  Recalcula depois de ler ou mudar a configuração. */
  private resolverExpressoes() {
    if (!this.page1 || this.ini.family !== 'speeduino') return;
    for (const f of this.ini.constants.values()) {
      if (f.kind === 'bits') continue;
      if (f.scaleExpr) { const v = this.evaluate(f.scaleExpr); if (v && Number.isFinite(v)) f.scale = v; }
      if (f.unitsExpr) {
        const m = f.unitsExpr.match(/^bitStringValue\(\s*(\w+)\s*,\s*(\w+)\s*\)$/);
        const lista = m && SPEEDUINO_LISTAS[m[1]];
        if (lista) f.units = lista[Number(this.constant(m[2]) ?? 0)] ?? '';
      }
    }
  }

  /** Nome da tabela nesta ECU (a Speeduino usa outros nomes; ver core/traducao.ts). */
  nomeTabela(name: string): string {
    if (this.ini.tables.has(name) || this.ini.family !== 'speeduino') return name;
    return SPEEDUINO_TABELAS[name]?.find((n) => this.ini.tables.has(n)) ?? name;
  }

  /** Quais destes nomes (tabelas, configurações ou canais) existem na ECU conectada. */
  existe(names: string[]): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const n of names) out[n] = this.ini.tables.has(this.nomeTabela(n)) || this.ini.constants.has(n) || this.ini.outputs.has(n)
      || this.ini.expressions.has(n) || (this.ini.family === 'speeduino' && n in SPEEDUINO_CANAIS);
    return out;
  }

  /** Todas as tabelas do .ini da ECU (tela genérica para ECUs que não são a nossa). */
  tabelasDoIni(): { name: string; title: string }[] {
    return [...this.ini.tables.values()].filter((t) => [t.xBins, t.yBins, t.zBins].every((n) => this.ini.constants.get(n)?.kind === 'array')).map((t) => ({ name: t.name, title: this.pt(t.title) }));
  }

  // ---- Funções tiradas do próprio .ini (menus, diálogos e curvas que o TunerStudio mostra) ----
  // Serve para qualquer ECU: a Speeduino e outras rusEFI ganham todas as telas de calibração delas.

  private condOk(cond?: string): boolean {
    if (!cond) return true;
    // vetor[i] vira o valor da posição; $variáveis do TunerStudio valem 0
    const limpo = cond.replace(/\$\w+/g, '0').replace(/([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\]/g, (_, n: string, i: string) => {
      const a = this.constant(n);
      return String(Array.isArray(a) ? a[Number(i)] ?? 0 : 0);
    });
    const v = this.evaluate(limpo);
    return v === undefined || Number.isNaN(v) ? true : !!v;
  }
  condicoes(exprs: string[]): boolean[] { return exprs.map((e) => this.condOk(e)); }

  /** Textos do .ini em português (Speeduino e outras; a rusEFI já tem as telas do app). */
  private pt(s: string): string { return this.ini.family === 'rusefi' ? s : ptRotulo(s); }

  /** Ferramentas de calibração do .ini (referenceTable): termistores e sonda. */
  calibracoes() { return this.ini.calibracoes; }

  /** Tela de calibração: tabelas (motor/ar ou sonda), sensores prontos do .ini e da biblioteca do app. */
  calibracaoIni(id: string) {
    const c = this.ini.calibracoes[id];
    if (!c) throw new Error(`calibração ${id} não existe nesta ECU`);
    const NOME: Record<string, string> = { 'Coolant Temperature Sensor': 'Sensor de temperatura do motor', 'Air Temperature Sensor': 'Sensor de temperatura do ar', 'AFR Table': 'Sonda (AFR)' };
    return {
      id, title: c.linear ? 'Calibrar sonda (AFR)' : 'Calibrar sensores de temperatura',
      tipo: c.linear ? 'sonda' : 'temperatura', pontos: c.adcCount,
      tabelas: c.tabelas.map((t) => ({ idx: t.idx, nome: NOME[t.nome] ?? t.nome })),
      termistores: c.termistores, linear: c.linear, sondas: c.linear ? [['Do arquivo da ECU (' + c.linear.xLo + '-' + c.linear.xHi + ' V)', c.linear.xLo, c.linear.yLo, c.linear.xHi, c.linear.yHi], ...SONDAS] : [],
    };
  }

  /** Gera a tabela e manda para a ECU (ela grava sozinha na EEPROM). Devolve a curva para mostrar. */
  async calibrar(id: string, idx: number, p: { bias?: number; pontos?: [number, number][]; v1?: number; a1?: number; v2?: number; a2?: number }) {
    const c = this.ini.calibracoes[id];
    if (!c || !c.tabelas.some((t) => t.idx === idx)) throw new Error('calibração não existe nesta ECU');
    if (this.ini.family !== 'speeduino') throw new Error('calibração de sensores só na Speeduino');
    let dados: number[], curva: number[];
    if (c.linear) {
      const { v1, a1, v2, a2 } = p;
      if ([v1, a1, v2, a2].some((x) => typeof x !== 'number' || !Number.isFinite(x)) || v1 === v2) throw new Error('confira as duas tensões e os dois AFR');
      curva = curvaLinear(v1!, a1!, v2!, a2!, c.adcCount);
      dados = bytesLinear(c, curva);
    } else {
      const pts = p.pontos;
      if (!p.bias || p.bias <= 0 || !pts || pts.length !== 3 || pts.some(([t, r]) => !Number.isFinite(t) || !(r > 0))) throw new Error('confira o resistor bias e os 3 pontos (temperatura e resistência)');
      if (new Set(pts.map(([t]) => t)).size < 3) throw new Error('as 3 temperaturas precisam ser diferentes');
      curva = curvaTermistor(p.bias, pts, c.adcCount);
      if (curva.some((x, i) => i > 0 && i < curva.length - 1 && !Number.isFinite(x))) throw new Error('esses 3 pontos não formam uma curva de termistor');
      dados = bytesTemperatura(c, idx, curva);
    }
    if (this.demo) return { curva };
    if (!this.client) throw new Error('sem conexão');
    const pacote = c.linear ? 256 : dados.length; // temperatura: o firmware quer os 64 bytes juntos
    for (const cmd of comandosCalibracao(idx, dados, pacote)) await this.client.calibracao(cmd);
    return { curva };
  }

  /** A que tela um alvo de menu/painel leva: tabela, curva ou diálogo (que pode ser só uma tabela/curva dentro). */
  private alvoIni(id: string, prof = 0): { kind: 't' | 'c' | 'd' | 'k'; id: string } | undefined {
    if (this.calibracoes()[id]) return { kind: 'k', id };
    const tb = this.ini.tables.get(id);
    if (tb) return [tb.xBins, tb.yBins, tb.zBins].every((n) => this.ini.constants.get(n)?.kind === 'array') ? { kind: 't', id } : undefined;
    const c = this.ini.curves.get(id);
    if (c) return this.ini.constants.get(c.x)?.kind === 'array' && this.ini.constants.get(c.y)?.kind === 'array' ? { kind: 'c', id } : undefined;
    const d = this.ini.dialogs.get(id);
    if (!d || prof > 5) return undefined;
    const temCampo = d.fields.some((f) => f.name && this.ini.constants.has(f.name)) || d.commands.some((c) => this.ini.commands.has(c.cmd));
    const filhos = d.panels.map((p) => this.alvoIni(p.id, prof + 1)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!temCampo && filhos.length === 1) return filhos[0];
    return temCampo || filhos.length ? { kind: 'd', id } : undefined;
  }

  /** Menus do .ini com o que dá para abrir no app. */
  funcoesIni(): { title: string; items: { kind: string; id: string; label: string; on: boolean }[] }[] {
    const out = [];
    for (const m of this.ini.menus) {
      if (/^(help|3d tuning maps|file|communications|data logging)$/i.test(m.title.trim())) continue;
      const items = [];
      for (const i of m.items) {
        if (i.target === 'stm32cmd') continue; // só para placas STM32 (reiniciar no bootloader)
        const a = this.alvoIni(i.target);
        if (a) items.push({ ...a, label: this.pt(i.label), on: this.condOk(i.cond) });
      }
      if (items.length) out.push({ title: this.pt(m.title), items });
    }
    return out;
  }

  /** Um diálogo do .ini achatado: seções com campos + atalhos para as tabelas e curvas de dentro. */
  dialogoIni(id: string) {
    type Botao = { label: string; cmd: string; cond?: string; fecha?: string };
    const secoes: { title: string; fields: { name: string; label: string; unit?: string; digits?: number; step?: number; big?: number; cond?: string }[]; botoes: Botao[]; avisos: string[] }[] = [];
    const links: { kind: string; id: string; label: string }[] = [];
    const vistos = new Set<string>();
    const anda = (did: string, cond: string | undefined, prof: number) => {
      const d = this.ini.dialogs.get(did);
      if (!d || prof > 6 || vistos.has(did)) return;
      vistos.add(did);
      const junta = (c?: string) => (cond && c ? `(${cond}) && (${c})` : cond ?? c);
      const fields = [];
      for (const f of d.fields) {
        if (f.name && this.ini.pcVars.has(f.name)) { fields.push({ name: f.name, label: this.pt(f.label || f.name), digits: 0, step: 1, big: 1, cond: junta(f.cond) }); continue; }
        const k = f.name ? this.ini.constants.get(f.name) : undefined;
        if (!f.name || !k || k.kind === 'array' || k.page !== 1) continue;
        const dg = k.kind === 'scalar' ? Math.min(3, Math.max(0, k.digits ?? 0)) : 0;
        const step = k.kind === 'scalar' && Math.abs(k.scale) > 10 ** -dg ? Math.abs(k.scale) : 10 ** -dg;
        fields.push({ name: f.name, label: this.pt(f.label || f.name), unit: k.kind === 'scalar' ? k.units : undefined, digits: dg, step, big: step * 10, cond: junta(f.cond) });
      }
      // textos soltos (field = "!Aviso...") e botões de comando (teste de saídas etc.)
      const avisos = d.fields.filter((f) => !f.name && /[A-Za-z]/.test(f.label)).map((f) => this.pt(f.label));
      const botoes: Botao[] = d.commands.filter((c) => this.ini.commands.has(c.cmd)).map((c) => ({ label: c.label === 'Off' && this.ini.family !== 'rusefi' ? 'Desligar' : this.pt(c.label), cmd: c.cmd, cond: junta(c.cond), fecha: c.flag }));
      if (fields.length || botoes.length || (avisos.length && !fields.length)) secoes.push({ title: this.pt(d.title), fields, botoes, avisos });
      for (const p of d.panels) {
        // std_injection = tela pronta do TunerStudio (combustível requerido e dados do motor)
        if (p.id === 'std_injection' || p.id === 'std_constants') {
          const f2 = STD_INJECTION.filter(([n]) => { const k = this.ini.constants.get(n); return k && k.kind !== 'array' && k.page === 1; }).map(([name, label]) => {
            const k = this.ini.constants.get(name)!;
            const dg = k.kind === 'scalar' ? Math.min(3, Math.max(0, k.digits ?? 0)) : 0;
            return { name, label, unit: k.kind === 'scalar' ? k.units : undefined, digits: dg, step: 10 ** -dg, big: 10 ** -dg * 10, cond: junta(p.cond) };
          });
          if (f2.length) secoes.push({ title: this.pt('Engine Constants'), fields: f2, botoes: [], avisos: [] });
          continue;
        }
        if (this.ini.dialogs.has(p.id)) { anda(p.id, junta(p.cond), prof + 1); continue; }
        const a = this.alvoIni(p.id);
        if (a && a.kind !== 'd' && !links.some((l) => l.id === a.id)) links.push({ ...a, label: this.pt((a.kind === 't' ? this.ini.tables.get(a.id)?.title : a.kind === 'c' ? this.ini.curves.get(a.id)?.title : this.calibracoes()[a.id]?.title) ?? a.id) });
      }
    };
    anda(id, undefined, 0);
    return { title: this.pt(this.ini.dialogs.get(id)?.title ?? id), secoes, links };
  }

  /** Uma curva do .ini pronta para o editor de curvas. */
  curvaIni(id: string) {
    const c = this.ini.curves.get(id);
    const x = c && this.ini.constants.get(c.x), y = c && this.ini.constants.get(c.y);
    if (!c || x?.kind !== 'array' || y?.kind !== 'array') throw new Error(`curva ${id} não existe nesta ECU`);
    const dg = Math.min(3, Math.max(0, y.digits ?? 0));
    const step = Math.max(10 ** -dg, Math.abs(y.scale) >= 1 ? Math.abs(y.scale) : 0);
    return { title: this.pt(c.title), x: c.x, y: c.y, xUnit: x.units || this.pt(c.xLabel), yUnit: y.units || this.pt(c.yLabel), live: c.xLive && (this.ini.outputs.has(c.xLive) || this.ini.expressions.has(c.xLive)) ? c.xLive : undefined,
      step, big: step * 5, digits: dg, xDigits: Math.min(2, Math.max(0, x.digits ?? 0)), hint: `${this.pt(c.xLabel)} × ${this.pt(c.yLabel)}` };
  }

  /** Avalia expressões simples do .ini (só nomes, números e operadores). */
  evaluate(expr: string, depth = 0): number | undefined {
    // arrayValue(array.X, i) da Speeduino: X é uma lista fixa do .ini (defaultValue), ex.: saídas por placa
    if (expr.includes('arrayValue')) {
      expr = expr.replace(/arrayValue\(\s*array\.(\w+)\s*,\s*([^()]+)\)/g, (_, n: string, i: string) => {
        const lista = this.ini.valoresPadrao.get(n);
        const k = this.evaluate(i.trim(), depth + 1);
        return String(lista && k !== undefined ? lista[Math.round(k)] ?? 0 : 0);
      });
    }
    if (!/^[\w\s.?:()+\-*/<>=!&|]+$/.test(expr)) return undefined;
    const names = [...new Set(expr.match(/[A-Za-z_]\w*/g) ?? [])];
    const vals = names.map((n) => {
      const c = this.constant(n);
      if (typeof c === 'number') return c;
      return this.live(n, depth) ?? 0;
    });
    try {
      // eslint-disable-next-line no-new-func
      const v = Function(...names, `"use strict";return (${expr});`)(...vals);
      return typeof v === 'number' ? v : Number(v);
    } catch {
      return undefined;
    }
  }

  liveValues(names: string[]): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const n of names) out[n] = this.live(n) ?? null;
    return out;
  }

  private async readExtraPages() {
    if (!this.client || this.ini.family !== 'rusefi' || !this.ini.pages.find((p) => p.number === 3)) return;
    try { this.pages.set(3, await this.client.readPage(this.ini, 3)); } catch { /* página opcional */ }
  }

  /** Manda um pedaço da página 1 e confere lendo de volta. Com senha travando (item 46) a ECU
   *  ignora a escrita sem dar erro (visto no simulador real), então o app avisa e mostra o que a ECU tem. */
  private async send(lo: number, hi: number) {
    if (!this.client || !this.page1 || hi <= lo) return;
    await this.client.writeChunk(this.ini, 1, lo, this.page1.subarray(lo, hi));
    const back = await this.client.readChunk(this.ini, 1, lo, hi - lo);
    if (back.some((b, i) => b !== this.page1![lo + i])) {
      this.page1.set(back, lo);
      throw new Error('A ECU não aceitou a mudança: esta parte está travada por senha. Libere em Configuração da interface > Senhas.');
    }
  }

  private pageData(n: number) { return n === 1 ? this.page1 : this.pages.get(n); }

  /** Botão de ação do .ini (cmd_*): teste de saída, zerar parcial, LTFT etc. */
  async command(name: string) {
    const bytes = this.ini.commands.get(name);
    if (!bytes) throw new Error(`comando ${name} não existe neste firmware`);
    if (this.demo && this.page1) {
      if (this.demo.command(name, this.page1, this.pages.get(3))) this.setStatus({ dirty: true });
      return;
    }
    if (!this.client) throw new Error('sem conexão');
    await this.client.command(bytes);
    if (name.startsWith('cmd_ltft')) {
      this.page1 = await this.client.readPage(this.ini, 1);
      await this.readExtraPages();
      if (name === 'cmd_ltft_apply_to_ve') this.setStatus({ dirty: true });
    }
  }

  /** Tabela pronta para a tela: eixos, valores e canais ao vivo dos eixos. */
  table(tableName: string) {
    const t = this.ini.tables.get(this.nomeTabela(tableName));
    if (!t || !this.page1) throw new Error(`tabela ${tableName} não encontrada`);
    const z = this.ini.constants.get(t.zBins) as ArrayField;
    const x = this.ini.constants.get(t.xBins) as ArrayField;
    const y = this.ini.constants.get(t.yBins) as ArrayField;
    return {
      name: tableName,
      title: this.pt(t.title),
      units: z.units,
      digits: z.digits ?? 2,
      min: z.min, max: z.max,
      rows: z.rows, cols: z.cols,
      xBins: decodeArray(this.page1, x),
      yBins: decodeArray(this.page1, y),
      xUnits: x.units, yUnits: y.units,
      xLive: t.xLive, yLive: t.yLive,
      readOnly: z.page !== 1,
      values: decodeArray(this.pageData(z.page) ?? this.page1, z), // linha a linha: índice = linha * cols + coluna
    };
  }

  /** Muda células e manda na hora para a ECU (memória de trabalho). */
  async setCells(tableName: string, cells: { index: number; value: number }[]) {
    const t = this.ini.tables.get(this.nomeTabela(tableName));
    if (!t || !this.page1 || !this.canWrite()) throw new Error('sem conexão');
    const z = this.ini.constants.get(t.zBins) as ArrayField;
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of cells) {
      const [a, b] = encodeArray(this.page1, z, [c.value], c.index);
      lo = Math.min(lo, a);
      hi = Math.max(hi, b);
    }
    await this.send(lo, hi);
    this.setStatus({ dirty: true });
    return this.table(tableName);
  }

  /** Muda um campo de opções (bits), ex.: a estratégia de combustível. */
  private locais = new Map<string, number>(); // variáveis só da tela ([PcVariables])

  async setBits(name: string, value: number) {
    if (this.ini.pcVars.has(name)) { this.locais.set(name, value); return; }
    const f = this.ini.constants.get(name);
    if (!f || f.kind !== 'bits' || f.page !== 1 || !this.page1 || !this.canWrite()) throw new Error(`campo ${name} indisponível`);
    const [lo, hi] = encodeBits(this.page1, f, value);
    await this.send(lo, hi);
    this.resolverExpressoes();
    this.setStatus({ dirty: true });
  }

  /** Muda posições de um campo vetor (curvas) e manda na hora para a ECU. Retorna o vetor novo. */
  async setArray(name: string, cells: { index: number; value: number }[]) {
    const f = this.ini.constants.get(name);
    if (f?.kind !== 'array' || f.page !== 1 || !this.page1 || !this.canWrite()) throw new Error(`campo ${name} indisponível`);
    let lo = Infinity, hi = -Infinity;
    for (const c of cells) {
      let v = c.value;
      if (Number.isFinite(f.min)) v = Math.max(f.min as number, v);
      if (Number.isFinite(f.max)) v = Math.min(f.max as number, v);
      const [a, b] = encodeArray(this.page1, f, [v], c.index);
      lo = Math.min(lo, a); hi = Math.max(hi, b);
    }
    await this.send(lo, hi);
    this.setStatus({ dirty: true });
    return decodeArray(this.page1, f);
  }

  /** Muda um campo simples ou de opções (página 1) e manda na hora para a ECU. */
  async setValue(name: string, value: number) {
    if (this.ini.pcVars.has(name)) { this.locais.set(name, Math.round(value)); return Math.round(value); }
    const f = this.ini.constants.get(name);
    if (!f || f.page !== 1 || f.kind === 'array' || !this.page1 || !this.canWrite()) throw new Error(`campo ${name} indisponível`);
    let v = value;
    if (f.kind === 'scalar') {
      if (Number.isFinite(f.min)) v = Math.max(f.min as number, v);
      if (Number.isFinite(f.max)) v = Math.min(f.max as number, v);
    }
    // Ordem de ignição e nº de cilindros precisam bater SEMPRE: se não, o firmware para com erro
    // ("Wrong cyl count for firing order", achado no simulador real). Os dois vão juntos num pedaço só.
    const fo = this.ini.constants.get('firingOrder');
    let extra: [number, number] | undefined;
    if (name === 'firingOrder' && fo?.kind === 'bits') {
      const n = ordemCilindros(fo.options[v]);
      const cyl = Number(this.constant('cylindersCount'));
      if (n !== undefined && n !== cyl) throw new Error(`Essa ordem é para ${n} cilindros e o motor está com ${cyl}. Mude o número de cilindros primeiro.`);
    }
    if (name === 'cylindersCount' && fo?.kind === 'bits') {
      const cur = ordemCilindros(fo.options[Number(this.constant('firingOrder'))]);
      if (cur !== undefined && cur !== Math.round(v)) {
        const novo = fo.options.findIndex((o) => ordemCilindros(o) === Math.round(v));
        if (novo < 0) throw new Error(`Não há ordem de ignição pronta para ${v} cilindros.`);
        extra = encodeBits(this.page1, fo, novo);
      }
    }
    let [lo, hi] = f.kind === 'bits' ? encodeBits(this.page1, f, v) : encodeScalar(this.page1, f, v);
    if (extra) { lo = Math.min(lo, extra[0]); hi = Math.max(hi, extra[1]); }
    await this.send(lo, hi);
    this.setStatus({ dirty: true });
    return decodeField(this.page1, f);
  }

  /** Copia os mapas de um ajuste para outro (1 a 3): injeção ms, VE, ignição, lambda e turbo. */
  async copyTune(from: number, to: number) {
    if (!this.page1 || !this.canWrite()) throw new Error('sem conexão');
    if (from === to || from < 1 || to < 1 || from > 3 || to > 3) throw new Error('ajuste inválido');
    const name = (n: number, t: string) => (n === 1 ? t : `extraTunes${n - 1}_${t}`);
    for (const t of ['injTimeTable', 'veTable', 'ignitionTable', 'lambdaTable', 'boostTableOpenLoop', 'boostTableClosedLoop']) {
      const a = this.ini.constants.get(name(from, t));
      const b = this.ini.constants.get(name(to, t));
      if (a?.kind !== 'array' || b?.kind !== 'array' || a.type !== b.type || a.rows * a.cols !== b.rows * b.cols) continue;
      const len = a.rows * a.cols * TYPE_SIZE[a.type];
      this.page1.copyWithin(b.offset, a.offset, a.offset + len);
      await this.send(b.offset, b.offset + len);
    }
    this.setStatus({ dirty: true });
  }

  /** Zerar ajuste 2 ou 3 (referência cap. 24.4): zera os mapas próprios; com o mapa vazio a ECU pula para o ajuste 1. */
  async zeroTune(n: number) {
    if (!this.page1 || !this.canWrite()) throw new Error('sem conexão');
    if (n !== 2 && n !== 3) throw new Error('só os ajustes 2 e 3 podem ser zerados');
    for (const t of ['injTimeTable', 'veTable', 'ignitionTable', 'lambdaTable', 'boostTableOpenLoop', 'boostTableClosedLoop']) {
      const a = this.ini.constants.get(`extraTunes${n - 1}_${t}`);
      if (a?.kind !== 'array') continue;
      const len = a.rows * a.cols * TYPE_SIZE[a.type];
      this.page1.fill(0, a.offset, a.offset + len);
      await this.send(a.offset, a.offset + len);
    }
    this.setStatus({ dirty: true });
  }

  /** Senhas (item 46): escreve a senha digitada e manda o comando. A ECU apaga o que foi digitado. */
  async password(action: string, entry: number, newPin = 0, locks = 0) {
    const idx = PW_CMDS[action];
    if (idx === undefined || !this.page1) throw new Error('comando de senha inválido');
    const put = (name: string, v: number) => {
      const f = this.ini.constants.get(name);
      if (f?.kind !== 'scalar') return [0, 0] as const;
      return encodeScalar(this.page1!, f, v);
    };
    const ranges = [put('ecuPasswords_pinEntry', entry), put('ecuPasswords_pinNew', newPin), put('ecuPasswords_newUserLocks', locks)];
    if (this.demo) this.demo.password(idx, this.page1);
    else if (this.client) {
      for (const [lo, hi] of ranges) if (hi > lo) await this.client.writeChunk(this.ini, 1, lo, this.page1.subarray(lo, hi));
      await this.client.command([0x5a, 0x00, 0x16, 0x00, idx]);
      // liberar/travar muda o que a ECU mostra (com senha, as partes travadas chegam zeradas): ler tudo de novo
      await new Promise((r) => setTimeout(r, 300));
      this.page1 = await this.client.readPage(this.ini, 1);
      await this.readExtraPages();
    } else throw new Error('sem conexão');
    // a senha digitada não fica guardada no app
    put('ecuPasswords_pinEntry', 0); put('ecuPasswords_pinNew', 0); put('ecuPasswords_newUserLocks', 0);
  }

  // ---------- mapas (.ftm) ----------
  private ftmXml?: string;

  private arr(name: string) {
    const f = this.ini.constants.get(name);
    return f?.kind === 'array' && f.page === 1 ? f : undefined;
  }

  /** Tabelas do .ftm que vamos usar, conforme o eixo do nosso mapa em ms (MAP ou TPS). */
  private ftLinks(): FtLink[] {
    const tps = this.page1 && this.ini.constants.get('injTimeUseTps') ? Number(decodeField(this.page1, this.ini.constants.get('injTimeUseTps')!)) === 1 : false;
    return FT_LINKS.filter((l) => (tps ? l.key !== 'inj' : l.key !== 'injTps'));
  }

  private fieldName(l: FtLink, base: string, tune: number) {
    return l.perTune && tune > 1 && base === l.z ? `extraTunes${tune - 1}_${base}` : base;
  }

  private tuneNow() {
    return Math.min(3, Math.max(1, Math.round(this.live('tuneInUse') ?? 1)));
  }

  /** Abre um .ftm (conteúdo em base64) e diz o que dá para importar. */
  ftmRead(b64: string) {
    if (!this.page1) throw new Error('sem conexão');
    const buf = Buffer.from(b64, 'base64');
    const xml = (buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString('utf8');
    if (!xml.includes('<Adjust')) throw new Error('Não parece um mapa .ftm');
    this.ftmXml = xml;
    const tune = this.tuneNow();
    const items = this.ftLinks().map((l) => {
      const t = readFtTable(xml, l.ft);
      const z = this.arr(this.fieldName(l, l.z, tune));
      return {
        key: l.key, title: l.title, found: !!t && !!z,
        ftSize: t ? (l.kind === 'curve' ? `${t.cols.length} pontos` : `${t.rows.length} × ${t.cols.length}`) : '',
        ecuSize: z ? (l.kind === 'curve' ? `${z.rows * z.cols} pontos` : `${z.cols} × ${z.rows}`) : '',
        perTune: !!l.perTune,
      };
    });
    return { name: ftName(xml), mainLoad: ftMainLoad(xml), product: /<ProductID>(\d+)/.exec(xml)?.[1] ?? '', tune, items };
  }

  /** Copia as tabelas escolhidas do .ftm aberto para a ECU (memória de trabalho; gravar depois). */
  async ftmApply(keys: string[]) {
    if (!this.ftmXml || !this.page1 || !this.canWrite()) throw new Error('abra um arquivo .ftm antes');
    const tune = this.tuneNow();
    const done: string[] = [];
    for (const l of this.ftLinks().filter((k) => keys.includes(k.key))) {
      const t = readFtTable(this.ftmXml, l.ft);
      const z = this.arr(this.fieldName(l, l.z, tune));
      const x = l.x ? this.arr(l.x) : undefined;
      if (!t || !z || !x) continue;
      const toEcu = l.toEcu ?? ((v: number) => v);
      const writes: [number, number][] = [];
      const axis = (f: typeof x, a: number[]) => (f.type === 'F32' ? a : intAxis(a));
      if (l.kind === 'curve') {
        const n = z.rows * z.cols;
        const xs = axis(x, pickAxis(t.cols, t.values, n));
        writes.push(encodeArray(this.page1, x, xs));
        writes.push(encodeArray(this.page1, z, xs.map((c) => toEcu(lookup(t, t.rows[0], c)))));
      } else {
        const y = this.arr(l.y!);
        if (!y) continue;
        // nosso mapa: linhas = carga (eixo y), colunas = RPM (eixo x); nos módulos profissionais é o contrário
        const byCol = t.cols.map((_, c) => t.values.map((row) => row[c]));
        const rpm = axis(x, pickAxis(t.rows, byCol, z.cols));
        const loadFt = pickAxis(t.cols, t.values, z.rows);
        const load = axis(y, loadFt.map(l.loadToEcu ?? ((v) => v)));
        writes.push(encodeArray(this.page1, x, rpm));
        writes.push(encodeArray(this.page1, y, load));
        const vals: number[] = [];
        for (let r = 0; r < z.rows; r++) for (let c = 0; c < z.cols; c++) vals.push(toEcu(lookup(t, rpm[c], loadFt[r])));
        writes.push(encodeArray(this.page1, z, vals));
      }
      for (const [lo, hi] of writes) await this.send(lo, hi);
      done.push(l.title);
    }
    if (done.length) this.setStatus({ dirty: true });
    return done;
  }

  /** Assistente de mapa padrão (estilo profissional, manual cap. 7): gera mapa em ms, ignição e lambda alvo do ajuste em uso. */
  async mapaPadrao(p: { rpmMax: number; mapMax: number; fuel: number; compression: number; cam: number }) {
    if (!this.page1 || !this.canWrite()) throw new Error('sem conexão');
    const page = this.page1;
    const num = (n: string) => { const f = this.ini.constants.get(n); return f ? Number(decodeField(page, f)) : 0; };
    const tune = this.tuneNow();
    const per = (base: string) => (tune > 1 ? `extraTunes${tune - 1}_${base}` : base);
    const need = (n: string) => { const f = this.arr(n); if (!f) throw new Error(`campo ${n} não existe no .ini`); return f; };
    const cyl = Math.max(1, num('cylindersCount'));
    const disp = num('displacement');
    const flow = num('injector_flow');
    if (!(disp > 0) || !(flow > 0)) throw new Error('Preencha a cilindrada e a vazão dos bicos na Configuração do motor');
    const useTps = num('injTimeUseTps') === 1;
    // combustível: estequiométrica, densidade (g/cc), lambda em plena carga com turbo, avanço a mais
    const FUEL = [
      { st: 14.7, d: 0.74, lBoost: 0.82, adv: 0 }, { st: 14.7, d: 0.74, lBoost: 0.80, adv: 2 },
      { st: 9.0, d: 0.79, lBoost: 0.78, adv: 4 }, { st: 6.4, d: 0.79, lBoost: 0.75, adv: 5 },
    ][p.fuel] ?? { st: 14.7, d: 0.74, lBoost: 0.82, adv: 0 };
    const compAdv = [-3, 0, 3][p.compression] ?? 0; // alta, média, baixa compressão
    // tempo morto a 14 V (primeira linha de pressão da tabela bateria × pressão)
    const batt = decodeArray(page, need('injector_battLagCorrBattBins'));
    const lag = decodeArray(page, need('injector_battLagCorrTable')).slice(0, batt.length);
    let dead = lag[lag.length - 1] ?? 0;
    for (let i = 0; i + 1 < batt.length; i++) if (14 >= batt[i] && 14 <= batt[i + 1]) dead = lag[i] + ((14 - batt[i]) / (batt[i + 1] - batt[i] || 1)) * (lag[i + 1] - lag[i]);
    if (14 < batt[0]) dead = lag[0];
    // eixos: RPM mais fino embaixo (como nos módulos profissionais), carga linear até a pressão máxima
    const rpmMax = Math.max(3000, Math.min(18000, p.rpmMax));
    const rpm = Array.from({ length: 16 }, (_, i) => Math.round((600 + (rpmMax - 600) * Math.pow(i / 15, 1.4)) / 50) * 50);
    const loadMax = useTps ? 100 : Math.max(100, Math.min(1000, p.mapMax));
    const load = Array.from({ length: 16 }, (_, i) => Math.round((useTps ? (100 * i) / 15 : 20 + ((loadMax - 20) * i) / 15)));
    const mapOf = (l: number) => (useTps ? 30 + 0.7 * l : l);
    // VE estimado: pico perto do torque máximo; comando mais bravo leva o pico para cima e perde embaixo
    const peak = [0.55, 0.65, 0.75][p.cam] ?? 0.65;
    const ve = (r: number, map: number) => {
      const x = r / rpmMax;
      const byRpm = 0.95 - 0.35 * Math.pow((x - peak) / (x < peak ? peak : 1 - peak + 0.2), 2);
      const byLoad = map >= 100 ? 1 : 0.7 + 0.3 * (map / 100);
      return Math.max(0.35, byRpm) * byLoad;
    };
    const lambda = (r: number, map: number) => {
      if (map <= 60) return r < 1500 ? 0.95 : 1.0;
      if (map <= 100) return 1.0 - ((map - 60) / 40) * (1.0 - 0.9);
      return Math.max(FUEL.lBoost, 0.9 - ((map - 100) / 100) * (0.9 - FUEL.lBoost));
    };
    const airG = (disp / cyl) * 1.184; // g de ar por cilindro a 100 kPa, VE 100%
    const flowGs = (flow * FUEL.d) / 60;
    const inj: number[] = [], ign: number[] = [], lam: number[] = [];
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
      const map = mapOf(load[r]); const rp = rpm[c];
      const fuel = (airG * ve(rp, map) * (map / 100)) / (FUEL.st * lambda(rp, map));
      inj.push(Math.min(60, (fuel / flowGs) * 1000 + dead));
      let adv = 10 + 22 * Math.min(1, Math.max(0, (rp - 800) / 3200));
      if (map < 100) adv += ((100 - map) / 80) * 10; else adv -= ((map - 100) / 100) * (p.fuel >= 2 ? 6 : 10);
      if (rp <= 1000 && map <= 60) adv = 14;
      ign.push(Math.round(Math.max(5, Math.min(45, adv + FUEL.adv + compAdv)) * 10) / 10);
      lam.push(Math.round(lambda(rp, map) * 147));
    }
    const writes: [number, number][] = [];
    writes.push(encodeArray(page, need('injTimeRpmBins'), rpm), encodeArray(page, need('injTimeLoadBins'), load));
    writes.push(encodeArray(page, need('ignitionRpmBins'), rpm), encodeArray(page, need('lambdaRpmBins'), rpm));
    if (!useTps) {
      writes.push(encodeArray(page, need('ignitionLoadBins'), load), encodeArray(page, need('lambdaLoadBins'), load));
    }
    writes.push(encodeArray(page, need(per('injTimeTable')), inj));
    writes.push(encodeArray(page, need(per('ignitionTable')), ign));
    writes.push(encodeArray(page, need(per('lambdaTable')), lam));
    for (const [lo, hi] of writes) await this.send(lo, hi);
    this.setStatus({ dirty: true });
    // Visto no simulador real: com bico pequeno o mapa pode pedir pulso maior que o ciclo do motor.
    // Ciclo de 4 tempos = 2 voltas = 120000 / RPM ms.
    let maxDuty = 0;
    inj.forEach((ms, k) => { maxDuty = Math.max(maxDuty, ms / (120000 / rpm[k % 16])); });
    return { tune, dead: Math.round(dead * 100) / 100, rpm, load, useTps, maxDuty: Math.round(maxDuty * 100) };
  }

  /** Gera um .ftm (base64) a partir de um modelo .ftm, trocando as tabelas que temos. */
  ftmExport(templateB64: string, name: string) {
    if (!this.page1) throw new Error('sem conexão');
    const buf = Buffer.from(templateB64, 'base64');
    let xml = (buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString('utf8');
    if (!xml.includes('<Adjust')) throw new Error('O modelo não é um mapa .ftm');
    const tune = this.tuneNow();
    const done: string[] = [];
    for (const l of this.ftLinks()) {
      const old = readFtTable(xml, l.ft);
      const z = this.arr(this.fieldName(l, l.z, tune));
      const x = l.x ? this.arr(l.x) : undefined;
      if (!old || !z || !x) continue;
      const toFt = l.toFt ?? ((v: number) => v);
      const zv = decodeArray(this.page1, z);
      const xv = decodeArray(this.page1, x);
      let t: FtTable;
      // mantém o número de pontos do modelo (o programa de origem pode não aceitar outro tamanho)
      if (l.kind === 'curve') {
        const ours: FtTable = { rows: [old.rows[0]], cols: xv, values: [zv] };
        const cols = pickAxis(xv, [zv], old.cols.length);
        t = { rows: old.rows, cols, values: [cols.map((c) => toFt(lookup(ours, old.rows[0], c)))] };
      } else {
        const y = this.arr(l.y!);
        if (!y) continue;
        const yv = decodeArray(this.page1, y).map(l.loadToFt ?? ((v) => v));
        // nossa tabela vista como referência: linhas = RPM, colunas = carga
        const ours: FtTable = { rows: xv, cols: yv, values: xv.map((_, c) => yv.map((__, r) => zv[r * z.cols + c])) };
        const rows = pickAxis(xv, yv.map((_, r) => xv.map((__, c) => zv[r * z.cols + c])), old.rows.length).map((v) => Math.round(v));
        const cols = pickAxis(yv, ours.values, old.cols.length).map((v) => Math.round(v * 100) / 100);
        t = { rows, cols, values: rows.map((rv) => cols.map((cv) => toFt(lookup(ours, rv, cv)))) };
      }
      xml = writeFtTable(xml, l.ft, t);
      done.push(l.title);
    }
    if (name) xml = setFtName(xml, name);
    return { data: zlib.gzipSync(Buffer.from(xml, 'utf8')).toString('base64'), done };
  }

  /** Lista de opções de um campo de bits, para mostrar o nome na tela. */
  options(name: string): string[] {
    const pv = this.ini.pcVars.get(name);
    if (pv) return pv.map(ptOpcao);
    const f = this.ini.constants.get(name);
    if (f?.kind !== 'bits') return [];
    return this.ini.family === 'rusefi' ? f.options : f.options.map(ptOpcao);
  }

  async burn() {
    if (this.offlinePath && this.page1) {
      const nome = path.basename(this.offlinePath).replace(/\.ecumap$/i, '');
      fs.writeFileSync(this.offlinePath, JSON.stringify(this.exportMap(nome), null, 1));
    } else if (this.demo && this.page1) this.demoSaved = this.page1.slice();
    else if (!this.client) throw new Error('sem conexão');
    else await this.client.burn(this.ini, 1);
    if (this.page1) this.flash = this.page1.slice();
    this.setStatus({ dirty: false });
  }

  /** Guarda como a configuração está antes de uma mudança. */
  snapshot() {
    if (!this.page1) return;
    this.history.push(this.page1.slice());
    if (this.history.length > 100) this.history.shift();
    this.setStatus({ undo: this.history.length });
  }

  /** Leva a configuração da ECU (RAM) de volta para "target", mandando só os pedaços que mudaram. */
  private async restore(target: Uint8Array) {
    if (!this.page1) throw new Error('sem conexão');
    const cur = this.page1, n = Math.min(cur.length, target.length);
    const ranges: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      if (cur[i] === target[i]) continue;
      const last = ranges[ranges.length - 1];
      if (last && i - last[1] < 16 && i + 1 - last[0] <= 128) last[1] = i + 1; else ranges.push([i, i + 1]);
    }
    for (const [lo, hi] of ranges) {
      cur.set(target.subarray(lo, hi), lo);
      if (!this.demo) await this.send(lo, hi);
    }
    const same = this.flash ? this.flash.every((b, i) => b === cur[i]) : false;
    this.setStatus({ dirty: !same, undo: this.history.length, rev: ++this.rev });
  }

  /** Arquivo de mapa do app (.ecumap): a configuração inteira + a assinatura do firmware. */
  exportMap(name: string) {
    if (!this.page1) throw new Error('Conecte na ECU para salvar o mapa.');
    return { formato: 'ecu-mapa', versao: 1, nome: name, assinatura: this.ini.signature, criado: new Date().toISOString(),
      pagina1: Buffer.from(this.page1).toString('base64') };
  }

  async importMap(m: { formato?: string; assinatura?: string; pagina1?: string }) {
    if (m.formato !== 'ecu-mapa' || !m.pagina1) throw new Error('Este arquivo não é um mapa do app.');
    if (m.assinatura === this.iniPadrao.signature) this.usarIniPadrao();
    if (!this.page1) throw new Error('Conecte na ECU para abrir o mapa.');
    if (m.assinatura !== this.ini.signature) throw new Error(`O mapa é de outro firmware (${m.assinatura}). A ECU está com ${this.ini.signature}.`);
    const target = new Uint8Array(Buffer.from(m.pagina1, 'base64'));
    if (target.length !== this.page1.length) throw new Error('Tamanho do mapa diferente do da ECU.');
    this.snapshot();
    await this.restore(target);
  }

  async undo() {
    const prev = this.history.pop();
    if (!prev) throw new Error('Nada para desfazer.');
    await this.restore(prev);
  }

  /** Cancela tudo que não foi gravado: volta ao que está na memória da ECU. */
  async cancel() {
    if (!this.flash) throw new Error('sem conexão');
    this.history = [];
    await this.restore(this.flash);
  }
}
