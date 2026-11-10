// Teste de saídas com o motor parado: cada botão pulsa a saída por alguns segundos
// (comandos de bancada do firmware). E zerar o odômetro parcial.
import { useState } from 'react';
import { call, useLive, useStatus } from '../api';
import { fmt } from '../format';

const GRUPOS: [string, [string, string][]][] = [
  ['Bicos', [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`cmd_test_inj${n}`, `Bico ${n}`])],
  ['Bobinas', [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`cmd_test_spk${n}`, `Bobina ${n}`])],
  ['Relés e válvulas', [
    ['cmd_test_main_relay', 'Relé principal'], ['cmd_test_fuel_pump', 'Bomba de combustível'], ['cmd_test_fan_1', 'Ventoinha 1'], ['cmd_test_fan_2', 'Ventoinha 2'],
    ['cmd_test_ac_relay', 'Relé do A/C'], ['cmd_test_idle_valve', 'Válvula de lenta'], ['cmd_test_starter_relay', 'Motor de partida'],
  ]],
];

export function Testes() {
  const s = useStatus();
  const v = useLive(['RPMValue', 'odometerPartial']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<[boolean, string]>();
  if (s.state !== 'conectado') return <main className="screen"><div className="notice err">Conecte na ECU para testar as saídas.</div></main>;
  const running = !s.demo && (v.RPMValue ?? 0) > 50; // no demo o motor falso gira sempre, então o teste fica liberado

  async function run(cmd: string, ok: string) {
    setBusy(true);
    try { await call('cmd', { name: cmd }); setMsg([true, ok]); } catch (e) { setMsg([false, (e as Error).message]); } finally { setBusy(false); }
  }
  return (
    <main className="screen" style={{ gap: 10, paddingTop: 10, overflowY: 'auto' }}>
      <div className="notice" style={{ background: running ? '#2D1719' : '#2A2116', color: running ? '#FF7A7E' : '#FFD08A' }}>
        {running ? 'Motor girando: a ECU só testa as saídas com o motor parado.' : 'Motor parado, chave ligada. Cada toque pulsa a saída por alguns segundos. Cuidado: o bico injeta combustível de verdade.'}
      </div>
      {GRUPOS.map(([g, items]) => (
        <section key={g} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="label">{g}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: 6 }}>
            {items.map(([cmd, name]) => (
              <button key={cmd} className="btn" style={{ height: 48, fontSize: 14 }} disabled={busy || running} onClick={() => run(cmd, `Testando: ${name}.`)}>{name}</button>
            ))}
          </div>
        </section>
      ))}
      {msg && <div className={`notice ${msg[0] ? 'ok' : 'err'}`}>{msg[1]}</div>}
    </main>
  );
}
