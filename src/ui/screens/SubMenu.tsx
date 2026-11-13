// Menus de segundo nível (ex.: Mapas de injeção -> mapa principal e compensações).
import type { Screen } from '../App';
import { CURVAS } from './Curva';
import { TABELAS } from './MapaInjecao';
import { FORMS } from './Configuracoes';
import { useDisponivel } from '../disponivel';

type Item = { label: string; sub: string; go: Screen };
const tabela = (id: string, sub = ''): Item => ({ label: TABELAS[id].title, sub, go: `t_${id}` as Screen });
const form = (id: string, sub = ''): Item => ({ label: FORMS[id].title, sub, go: `f_${id}` as Screen });
const curva = (id: string, sub = ''): Item => ({ label: CURVAS[id].title, sub, go: `c_${id}` as Screen });

export const SUBMENUS: Record<string, { title: string; items: Item[] }> = {
  // Ordem do manual de referência, cap. 17 (injeção) e 18 (ignição).
  menuInjecao: { title: 'Mapas de injeção', items: [
    { label: 'Mapa principal de injeção', sub: 'Tempo de injeção em ms, RPM × MAP', go: 'mapa' },
    tabela('lambda', 'Alvo da malha fechada, ajuste 1 a 3'),
    form('malha', 'Sonda, limites, por cilindro'), curva('stftAdd'), curva('stftRemove'),
    { label: 'Correção de longo prazo', sub: 'O que a ECU aprendeu (LTFT), aplicar no mapa', go: 'ltft' },
    curva('idleTps', 'Tempo de injeção por RPM com borboleta fechada'),
    form('accel', 'Quando entra, decaimento, corte na desaceleração'), tabela('accel', 'Borboleta antes × depois'), curva('accelCold'),
    curva('cltFuel', 'Correção em %'), curva('iatFuel', 'Correção em %'),
    curva('compMapTps', 'Pelo sensor que o mapa não usa'),
    curva('prime', 'Primeiro pulso de partida'), curva('crankFuel'), form('partida', 'Desafogar, pressão de óleo'),
    tabela('postCrank', 'Ciclos × temperatura'),
    { label: 'Ajuste individual por cilindro', sub: 'Correção de combustível de cada cilindro', go: 'menuCilInj' },
    tabela('gearFuel', 'RPM × marcha'), tabela('shiftFuel', 'Marcha × tempo'), tabela('injPhase', 'Ângulo por RPM × carga'),
  ] },
  menuIgnicao: { title: 'Mapas de ignição', items: [
    { label: 'Mapa principal de ignição', sub: 'Avanço, RPM × MAP', go: 'ignicao' },
    tabela('ignClt', 'Temperatura × carga'), tabela('ignIat', 'Temperatura × carga'),
    { label: 'Ajuste individual por cilindro', sub: 'Avanço de cada cilindro', go: 'menuCilIgn' },
    form('limitesPonto', 'Avanço mínimo e máximo'),
    curva('crankAdv'), curva('crankAdvClt'), tabela('gearTiming', 'RPM × marcha'), tabela('shiftRetard', 'Marcha × tempo'),
    curva('dwellVolt'), form('knock'),
  ] },
  menuCilInj: { title: 'Injeção por cilindro', items: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => tabela(`fuelTrim${n}`, 'Correção em %, RPM × carga')) },
  menuCilIgn: { title: 'Ignição por cilindro', items: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => tabela(`ignTrim${n}`, 'Graus a mais ou a menos, RPM × carga')) },
  // Ordem do manual de referência, cap. 23.
  menuInterface: { title: 'Configuração da interface', items: [
    { label: 'Tela, som e tela inicial', sub: 'Luz de fundo dia/noite, bipe de alerta', go: 'telaSom' },
    { label: 'Configuração do painel', sub: 'Mostradores, barra de RPM, zerar picos', go: 'painelCfg' },
    { label: 'Senhas', sub: 'Usuário, preparador e manutenção', go: 'senhas' },
    { label: 'Unidades de medida', sub: 'bar ou psi, lambda ou AFR', go: 'interface' },
    { label: 'Versões, odômetro e horímetro', sub: 'App, firmware, zerar o parcial', go: 'versao' },
  ] },
  // Ordem do manual de referência, cap. 19 (e cap. 14 para a borboleta eletrônica).
  menuOutras: { title: 'Outras funções', items: [
    form('sdlog'),
    form('lenta', 'Modo, PID, depois da partida, ponto'), curva('idleRpm'), curva('crankIdle'), curva('idleAdv', 'Controle de lenta pelo ponto'),
    form('desaceleracao', 'Corte de combustível ao soltar o pedal'),
    { label: 'Corte de rotação e largada', sub: 'Corte, corte progressivo, 2-step', go: 'outras' }, curva('revClt'),
    form('ventoinhas', 'Temperatura, combustível e lenta a mais'), form('arCondicionado', 'Atraso, limites, compensações'),
    form('bomba', 'Tempo ligada ao ligar a chave'), form('partidaFrio', 'Bico de partida a frio'), curva('coldStartPulse', 'Por temperatura'),
    form('vtec', 'Rotação, temperatura, borboleta, óleo'),
    { label: 'Saídas PWM programáveis', sub: '8 saídas: PWM, por MAP, por RPM, genéricas', go: 'menuPwm' },
    form('contagiros', 'Pulsos por volta'),
    form('shiftLight', 'RPM por marcha, barra de LEDs, lâmpada'),
    { label: 'Controle de turbo', sub: 'Liga, tipo, limites', go: 'turbo' },
    tabela('boostOpen', 'Ajuste 1 a 3'), tabela('boostClosed', 'Ajuste 1 a 3'), tabela('boostShift'), form('turboExtra'),
    form('nitro', 'Rotação, borboleta, combustível e ponto'),
    form('trocaRapida', 'Corte de ignição na troca, sem tirar o pé'),
    form('wastegateEletronica', 'Wastegate com motor elétrico e sensor'),
    form('antilag', 'Botão, rotação, borboleta, ar a mais'), tabela('alsPonto', 'RPM × borboleta'), tabela('alsComb', 'RPM × borboleta'), tabela('alsCorte', 'RPM × borboleta'),
    curva('boostEthanol', 'Limite do alerta'),
    form('wmi', 'Saída PWM, nível do tanque, ponto e combustível'),
    form('tracao', 'Rodas por fio ou pela CAN (ABS)'), tabela('tcTiming', 'Velocidade × patinagem'), tabela('tcSkip', 'Velocidade × patinagem'), tabela('tcEtb', 'Velocidade × patinagem'),
    form('troca', 'Retardo e combustível na troca'), form('botaoPartida', 'Botão, relé do motor de partida'),
    form('vvt', 'Saída, PID, quando controla'), tabela('vvt', 'RPM × carga'),
    form('etb', 'Abertura máxima, religar sozinha, blip'), curva('etbOpen', 'Pela temperatura do motor'), curva('etbClose', 'Pela temperatura do motor'),
  ] },
  menuPwm: { title: 'Saídas PWM programáveis', items: [1, 2, 3, 4, 5, 6, 7, 8].flatMap((g) => [form(`gppwm${g}`, 'Pino, frequência, eixos'), tabela(`gppwm${g}`, 'Duty por eixo X × Y')]) },
  menuCan: { title: 'CAN personalizada', items: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => form(`can${n}`, '4 valores, enviar ou receber')) },
  menuMotor: { title: 'Configuração do motor', items: [
    { label: 'Características do motor', sub: 'Saídas, cilindros, ordem de ignição, mapa por MAP ou TPS', go: 'motor' },
    { label: 'Sinal de RPM', sub: 'Roda fônica, sensor, borda, alinhamento', go: 'sinalRpm' },
    form('fase', 'Tipo, sensor, borda, janela, só na partida'), form('ignicao', 'Modo de ignição, saída'), curva('dwell', 'Tempo de carga por rotação'),
    form('bicos', 'Vazão, modo, momento da injeção'), tabela('deadTime', 'Bateria × pressão'),
    form('atuadorLenta', 'Válvula PWM, motor de passo ou borboleta'),
    form('saidas', 'Em qual pino da placa liga cada bico, bobina, relé e botão'),
  ] },
  // Ordem do manual de referência, cap. 15. Cada sensor escolhe o fio de entrada na própria tela.
  menuSensores: { title: 'Sensores e calibração', items: [
    form('sensTps', 'Entrada, fechada e aberta, sensor 2'), form('pedal', 'Pedal solto e no fundo'),
    form('sensPressao', 'Entrada, 2 pontos ou curva'), curva('oilCurve', '8 pontos'), curva('fuelCurve', '8 pontos'),
    form('sensTemp', 'Entrada e calibração do termistor'),
    form('sensVel', 'Entrada, dentes, roda'), form('sensMap', 'Entrada, modelo, pressão atmosférica'), form('sensMarcha', 'Relação de cada marcha'),
    form('can', 'CAN para painéis'), { label: 'CAN personalizada', sub: '8 frames, enviar ou receber', go: 'menuCan' },
    form('sensOutros', 'Sonda 0-5 V, etanol, intercooler'),
  ] },
  menuDiag: { title: 'Diagnóstico', items: [
    { label: 'Sensores e contadores', sub: 'Tensões, erros, cartão SD', go: 'diagnostico' },
    { label: 'Teste de saídas', sub: 'Bicos, bobinas, relés', go: 'testes' },
    { label: 'Datalogger', sub: 'Gravar e ver logs', go: 'datalogger' },
    { label: 'Mapas e logs salvos', sub: 'Abrir, salvar e apagar arquivos', go: 'inicio' },
  ] },
};

export function SubMenu({ id, go }: { id: string; go: (s: Screen) => void }) {
  const m = SUBMENUS[id];
  const ok = useDisponivel();
  return (
    <main className="screen" style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: '96px', gap: 12, alignContent: 'start', paddingTop: 10 }}>
      {m.items.filter((it) => ok(it.go)).map((it) => (
        <button key={it.label} className="card" onClick={() => go(it.go)}
          style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flexGrow: 1 }}>
            <span className="num" style={{ fontSize: 22 }}>{it.label}</span>
            {it.sub && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{it.sub}</span>}
          </span>
          <span style={{ fontSize: 26, color: 'var(--muted)' }}>›</span>
        </button>
      ))}
    </main>
  );
}
