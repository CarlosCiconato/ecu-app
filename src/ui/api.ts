// Conversa da tela com a ponte (WebSocket). A ponte é quem fala com a ECU.
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface EcuStatus {
  state: 'desconectado' | 'conectando' | 'lendo' | 'conectado' | 'erro';
  message?: string;
  ecuSignature?: string;
  iniSignature: string;
  signatureMatch?: boolean;
  progress?: number;
  dirty: boolean;
  demo?: boolean;
  undo?: number;
  rev?: number;
  offline?: string;
}

export interface TableData {
  name: string; title: string; units: string; digits: number;
  min?: number; max?: number; rows: number; cols: number; readOnly?: boolean;
  xBins: number[]; yBins: number[]; xUnits: string; yUnits: string;
  xLive?: string; yLive?: string; values: number[];
}

type Listener = () => void;
let ws: WebSocket | undefined;
let status: EcuStatus = { state: 'desconectado', iniSignature: '', dirty: false };
let bridgeUp = false;
let live: Record<string, number | null> = {};
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
const listeners = new Set<Listener>();
const liveNames = new Map<number, string[]>();
let liveKey = 1;
const emit = () => listeners.forEach((l) => l());

function open() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { bridgeUp = true; pushSubscriptions(); emit(); };
  ws.onclose = () => { bridgeUp = false; emit(); setTimeout(open, 1000); };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'status') { status = msg.status; autoLog(); emit(); }
    else if (msg.type === 'live') { live = { ...live, ...msg.values }; autoLog(); if (rec) recordSample(); emit(); }
    else if (msg.type === 'reply') {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(msg.error)); else p?.resolve(msg.result);
    }
  };
}
open();

export function call<T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error('sem ponte com a ECU'));
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, op, ...args }));
  });
}

function pushSubscriptions() {
  const names = [...new Set([...liveNames.values()].flat())];
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'subscribe', names }));
}

const subscribe = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };

export function useStatus() {
  const s = useSyncExternalStore(subscribe, () => status);
  const b = useSyncExternalStore(subscribe, () => bridgeUp);
  return { ...s, bridgeUp: b };
}

/** Pede canais ao vivo enquanto a tela estiver aberta. */
export function useLive(names: string[]): Record<string, number | null> {
  const key = names.join(',');
  useEffect(() => {
    const k = liveKey++;
    liveNames.set(k, names);
    pushSubscriptions();
    return () => { liveNames.delete(k); pushSubscriptions(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useSyncExternalStore(subscribe, () => live);
}

export function useTable(name: string) {
  const s = useStatus();
  const [table, setTable] = useState<TableData>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (s.state !== 'conectado') return;
    call<TableData>('table', { name }).then(setTable, (e) => setError(e.message));
  }, [name, s.state, s.rev]);
  return { table, setTable, error };
}

// ===== Datalogger: grava os canais ao vivo enquanto estiver ligado (mesmo com a tela fechada). =====
export interface LogData { name: string; channels: string[]; t: number[]; data: (number | null)[][]; recording?: boolean }
let rec: { start: number; key: number } | undefined;
let log: LogData | undefined;
let logVer = 0;
const LOG_MAX = 20 * 60 * 25; // ~20 min a 25 amostras/s
let lastSample = 0;
function recordSample() {
  if (!rec || !log) return;
  const now = performance.now();
  if (now - lastSample < 1000 / logCfg.taxa - 5) return;
  lastSample = now;
  log.t.push((performance.now() - rec.start) / 1000);
  log.channels.forEach((c, i) => log!.data[i].push(live[c] ?? null));
  if (log.t.length >= LOG_MAX) stopLog();
  logVer++;
}
export function startLog(channels: string[]) {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  log = { name: `Log ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}h${p2(d.getMinutes())}m${p2(d.getSeconds())}s`, channels, t: [], data: channels.map(() => []), recording: true };
  rec = { start: performance.now(), key: liveKey++ };
  liveNames.set(rec.key, channels);
  pushSubscriptions();
  logVer++; emit();
}
export function stopLog() {
  if (rec) { liveNames.delete(rec.key); pushSubscriptions(); }
  rec = undefined;
  if (log) log = { ...log, recording: false };
  logVer++; emit();
}
export function setLog(l: LogData | undefined) { stopLog(); log = l; logVer++; emit(); }
export function useLog() {
  useSyncExternalStore(subscribe, () => logVer);
  return log;
}
export const isRecording = () => !!rec;

// ===== Configurações do datalogger (começar/parar sozinho, taxa, salvar sozinho) =====
export interface LogCfg { inicio: 'manual' | 'rpm' | 'tps' | 'sempre'; rpm: number; tps: number; parar: number; taxa: number; salvar: boolean; canais?: string[] }
const LOG_CFG_PADRAO: LogCfg = { inicio: 'manual', rpm: 2500, tps: 50, parar: 3, taxa: 20, salvar: true };
let logCfg: LogCfg = (() => { try { return { ...LOG_CFG_PADRAO, ...JSON.parse(localStorage.getItem('logCfg') ?? '{}') }; } catch { return LOG_CFG_PADRAO; } })();
let autoKey: number | undefined;
let autoStarted = false;
let belowSince = 0;
export const getLogCfg = () => logCfg;
export function setLogCfg(c: LogCfg) {
  logCfg = c;
  try { localStorage.setItem('logCfg', JSON.stringify(c)); } catch { /* sem armazenamento */ }
  watchAuto();
}
/** Canais que o modo automático precisa ler mesmo sem nenhuma tela pedindo. */
function watchAuto() {
  if (autoKey !== undefined) { liveNames.delete(autoKey); autoKey = undefined; }
  if (logCfg.inicio === 'rpm' || logCfg.inicio === 'tps') { autoKey = liveKey++; liveNames.set(autoKey, ['RPMValue', 'TPSValue']); }
  pushSubscriptions();
}
let autoChannels: string[] = [];
export const setAutoChannels = (c: string[]) => { autoChannels = c; };
function autoLog() {
  const on = status.state === 'conectado' && !status.offline;
  const want = logCfg.inicio === 'sempre' ? on
    : logCfg.inicio === 'rpm' ? on && (live.RPMValue ?? 0) > logCfg.rpm
    : logCfg.inicio === 'tps' ? on && (live.TPSValue ?? 0) > logCfg.tps : false;
  if (logCfg.inicio === 'manual') return;
  if (want && !rec) { startLog(autoChannels.length ? autoChannels : Object.keys(live)); autoStarted = true; belowSince = 0; return; }
  if (rec && autoStarted && !want) {
    const now = performance.now();
    if (!belowSince) belowSince = now;
    if (!on || now - belowSince > logCfg.parar * 1000) { stopLog(); autoStarted = false; if (logCfg.salvar) void saveLogNow(); }
  } else belowSince = 0;
}
/** Salva o log atual na pasta Logs (.csv). */
export async function saveLogNow() {
  if (!log || !log.t.length) return;
  const l = log;
  const csv = ['Tempo,' + l.channels.join(','), ...l.t.map((t, i) => [t.toFixed(3), ...l.data.map((d) => (d[i] == null ? '' : String(d[i])))].join(','))].join('\n');
  return call<string>('saveFile', { kind: 'logs', name: `${l.name}.csv`, data: btoa(unescape(encodeURIComponent(csv))) });
}
setTimeout(watchAuto, 0);
