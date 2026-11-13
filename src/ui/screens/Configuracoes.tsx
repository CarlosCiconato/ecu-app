// Telas de configuração feitas com o Formulario genérico.
import { Formulario, type CampoDef, type SecaoDef } from './Formulario';
import { SENSOR_PT } from './Alertas';

// Nomes em português das fontes de sinal (eixos das saídas PWM, valores da CAN).
const CANAL = Object.fromEntries(Object.entries(SENSOR_PT).map(([k, v]) => [k, v[0]]));

const SIM_NAO = { 0: 'Não', 1: 'Sim' };
const DESL_LIG = { 0: 'Desligado', 1: 'Ligado' };
const INJ_MODO = { 0: 'Simultânea', 1: 'Sequencial', 2: 'Semissequencial', 3: 'Monoponto' };

const VR_HALL = { 0: 'Indutivo (VR)', 1: 'Hall' };
// Listas enxutas em português; "Mostrar todos" abre a lista inteira do firmware.
const RODA: Record<number, string> = {
  0: 'Personalizada (dentes e falhas)', 8: '60-2', 9: '36-1', 48: '36-2', 69: '32-2', 46: 'Honda K 12+1 (K20/K24)', 67: 'Honda K 4+1',
  11: 'Um dente', 27: 'GM 24x (5°)', 74: 'GM 24x (3°)', 33: 'Mazda Miata NB', 3: 'Mazda Miata NA', 76: 'Mitsubishi 4G63',
};
const FASE: Record<number, string> = {
  0: 'Sem sensor de fase', 36: 'Personalizado (janela no dente)', 1: 'Um dente', 10: 'Honda K admissão', 16: 'Honda K escape',
  2: 'Toyota 3 dentes (2JZ)', 3: 'Mazda Miata NB2', 4: 'Mitsubishi 4G69', 18: 'Mitsubishi 4G63', 13: 'Pela pressão do MAP (sem sensor)',
};
/** Campo do anti-lag que só aparece com ele ligado. */
const alsOn = (f: CampoDef): CampoDef => ({ ...f, showIf: (v) => v.antiLagEnabled === 1 });
const nCil = (vals: Record<string, unknown>) => Number(vals.cylindersCount ?? 4);
// Ordem de ignição: só as que têm o mesmo número de cilindros do motor.
const ORDEM_CUSTOM = 37; // item 60 do firmware: "Custom (type it)"
const pickOrdem = (label: string, vals: Record<string, unknown>) => label.startsWith('Custom') || label.split(' ')[0].split(/[-_]/).length === nCil(vals) || (label === 'One Cylinder' && nCil(vals) === 1);
/** Ordem personalizada: posição 1..N → cilindro. Avisa cilindro repetido ou fora de 1..N (o firmware cai para 1-2-3… e dá o aviso 6024). */
const ORDEM_FIELDS: CampoDef[] = Array.from({ length: 12 }, (_, k) => ({
  name: `customFiringOrder${k + 1}`, label: `${k + 1}º a disparar: cilindro`, step: 1, big: 1,
  showIf: (v) => v.firingOrder === ORDEM_CUSTOM && k < nCil(v),
  warn: k === 0 ? (v) => {
    const n = nCil(v);
    const seq = Array.from({ length: n }, (_, j) => Number(v[`customFiringOrder${j + 1}`]));
    if (seq.some((c) => !(c >= 1 && c <= n))) return `Use cilindros de 1 a ${n}.`;
    const rep = seq.filter((c, j) => seq.indexOf(c) !== j);
    return rep.length ? `Cilindro ${[...new Set(rep)].join(', ')} repetido. Com a ordem errada a ECU usa 1-2-3… e avisa.` : undefined;
  } : undefined,
}));
export const RODA_FIELDS: CampoDef[] = [
  { name: 'trigger_type', label: 'Roda fônica (rotação)', only: [0, 8, 9, 48, 69, 46, 67, 11, 27, 74, 33, 3, 76], labels: RODA, showAll: true },
  { name: 'trigger_customTotalToothCount', label: 'Roda personalizada: total de dentes (contando as falhas)', step: 1, big: 10, showIf: (v) => v.trigger_type === 0 },
  { name: 'trigger_customSkippedToothCount', label: 'Roda personalizada: dentes faltando', step: 1, big: 1, showIf: (v) => v.trigger_type === 0 },
];
export const FASE_FIELDS: CampoDef[] = [
  { name: 'vvtMode1', label: 'Sensor de fase (comando)', only: [0, 36, 10, 16, 1, 2, 3, 4, 18, 13], labels: FASE, showAll: true },
  { name: 'camSyncWindowStart1', label: 'Personalizado: começo da janela', unit: '°', step: 1, big: 10, showIf: (v) => v.vvtMode1 === 36, hint: 'Só o dente que cai dentro da janela sincroniza. No K20 ponha a janela no dente extra.' },
  { name: 'camSyncWindowWidth1', label: 'Personalizado: largura da janela', unit: '°', step: 1, big: 5, showIf: (v) => v.vvtMode1 === 36 },
  { name: 'camSyncToothCount1', label: 'Personalizado: dentes por volta do comando (0 = não confere)', step: 1, big: 5, showIf: (v) => v.vvtMode1 === 36 },
];

// Configuração do motor na ordem do assistente referência (manual cap. 7):
// características do motor, sinal de RPM, sinal de fase, ignição, injeção.
const MOTOR: SecaoDef[] = [
  { title: 'Saídas', fields: [
    { name: 'isInjectionEnabled', label: 'Injeção', labels: { 0: 'Desativada', 1: 'Ativada' } },
    { name: 'isIgnitionEnabled', label: 'Ignição', labels: { 0: 'Desativada', 1: 'Ativada' }, hint: 'Deixe desativado até terminar a configuração (igual a "Habilitar as saídas" dos módulos profissionais).' },
  ] },
  { title: 'Motor', fields: [
    { name: 'cylindersCount', label: 'Número de cilindros' },
    { name: 'firingOrder', label: 'Ordem de ignição', pick: pickOrdem, showAll: true, labels: { [ORDEM_CUSTOM]: 'Personalizada (digitar a ordem)' }, hint: 'A lista mostra só as ordens com o número de cilindros acima.' },
    ...ORDEM_FIELDS,
    { name: 'displacement', label: 'Cilindrada', unit: 'L', step: 0.1, big: 0.5, digits: 2 },
  ] },
  { title: 'Mapa e partida', fields: [
    { name: 'injTimeUseTps', label: 'Mapa principal de injeção por', labels: { 0: 'MAP', 1: 'TPS' }, hint: 'MAP para turbo e carro de rua; TPS para aspirado com comando bravo.' },
    { name: 'cranking_rpm', label: 'Rotação de partida (abaixo disso valem as rotinas de partida)', unit: 'RPM', step: 50, big: 200 },
  ] },
];
const SINAL_RPM: SecaoDef[] = [
  { title: 'Roda fônica', fields: [...RODA_FIELDS] },
  { title: 'Sensor de rotação', fields: [
    { name: 'triggerSensorType1', label: 'Tipo de sensor', labels: VR_HALL },
    { name: 'invertPrimaryTriggerSignal', label: 'Borda', labels: { 0: 'Subida', 1: 'Descida' }, hint: 'Se a ECU não ler a rotação, troque a borda.' },
    { name: 'globalTriggerAngleOffset', label: 'Alinhamento (ajuste com a lâmpada de ponto)', unit: '°', step: 1, big: 10 },
  ] },
  { title: 'Calibrar o ponto com a lâmpada', fields: [
    { name: 'timingMode', label: 'Avanço', labels: { 0: 'Pelo mapa', 1: 'Fixo (para calibrar)' } },
    { name: 'fixedModeTiming', label: 'Avanço fixo', unit: '°', step: 1, big: 5 },
  ] },
];

const OUTRAS: SecaoDef[] = [
  { title: 'Corte de rotação', fields: [
    { name: 'rpmHardLimit', label: 'Rotação máxima (corte)', unit: 'RPM', step: 100, big: 1000 },
    { name: 'cutFuelOnHardLimit', label: 'Cortar combustível', labels: SIM_NAO, only: [1, 0] },
    { name: 'cutSparkOnHardLimit', label: 'Cortar centelha', labels: SIM_NAO, only: [1, 0] },
    { name: 'progressiveRevLimitEnabled', label: 'Corte progressivo (antes do limite)', labels: DESL_LIG },
    { name: 'progressiveRevLimitWindow', label: 'Começa antes do limite', unit: 'RPM', step: 50, big: 250 },
    { name: 'progressiveRevLimitStartCut', label: 'Corte no começo da faixa', unit: '%', step: 5, big: 20 },
  ] },
  { title: 'Largada (2-step)', fields: [
    { name: 'launchControlEnabled', label: 'Controle de largada', labels: DESL_LIG },
    { name: 'launchRpm', label: 'Rotação da largada', unit: 'RPM', step: 100, big: 500 },
    { name: 'launchSparkCutEnable', label: 'Cortar centelha', labels: SIM_NAO, only: [1, 0] },
    { name: 'launchFuelCutEnable', label: 'Cortar combustível', labels: SIM_NAO, only: [1, 0] },
    { name: 'enableLaunchRetard', label: 'Atrasar o ponto', labels: SIM_NAO, only: [1, 0] },
    { name: 'launchTimingRetard', label: 'Avanço na largada', unit: '°', step: 1, big: 5 },
  ] },
];

// Sensores e calibração na ordem do manual de referência (cap. 15). Cada sensor escolhe o fio de entrada na própria tela.
const term = (k: string, nome: string): CampoDef[] => [
  { name: `${k}_adcChannel`, label: `Entrada do sensor de ${nome}`, hint: 'Sensor pronto preenche os 3 pontos com valores típicos; confira com a ficha do sensor.' },
  ...[1, 2, 3].flatMap((n) => [
    { name: `${k}_tempC_${n}`, label: `Ponto ${n}: temperatura`, unit: '°C', step: 1, big: 10 },
    { name: `${k}_resistance_${n}`, label: `Ponto ${n}: resistência`, unit: 'Ω', step: 10, big: 100 },
  ]),
  { name: `${k}_bias_resistor`, label: 'Resistor de polarização da placa', unit: 'Ω', step: 10, big: 100, hint: 'Valor do resistor de pull-up da placa (normalmente 2490 Ω).' },
];
// Termistores mais usados (temperatura °C / resistência Ω em 3 pontos).
const TERMISTORES: [string, number[]][] = [
  ['Padrão (NTC)', [-20, 15462, 25, 2057, 100, 186]],
  ['GM', [-40, 100700, 30, 2238, 100, 177]],
  ['Honda (K20)', [-20, 16200, 20, 2500, 80, 330]],
  ['VW / Audi', [-20, 15000, 30, 1650, 100, 186]],
];
const termPresets = (k: string) => TERMISTORES.map(([label, p]) => ({ label, values: {
  [`${k}_tempC_1`]: p[0], [`${k}_resistance_1`]: p[1], [`${k}_tempC_2`]: p[2], [`${k}_resistance_2`]: p[3], [`${k}_tempC_3`]: p[4], [`${k}_resistance_3`]: p[5],
} }));
const pressao2 = (k: string, nome: string, live: string): CampoDef[] => [
  { name: `${k}_v1`, label: `${nome}: tensão no ponto 1`, unit: 'V', step: 0.01, big: 0.1, digits: 2, live },
  { name: `${k}_value1`, label: `${nome}: pressão no ponto 1`, unit: 'kPa', step: 1, big: 10 },
  { name: `${k}_v2`, label: `${nome}: tensão no ponto 2`, unit: 'V', step: 0.01, big: 0.1, digits: 2 },
  { name: `${k}_value2`, label: `${nome}: pressão no ponto 2`, unit: 'kPa', step: 1, big: 10 },
];
const curva8 = (v: Record<string, unknown>, k: string) => v[k] !== 1;

const SENSORES_TPS: SecaoDef[] = [
  { title: 'Sensor 1 da borboleta', fields: [
    { name: 'tps1_1AdcChannel', label: 'Entrada' },
    { name: 'tpsMin', label: 'Borboleta fechada', unit: 'V', step: 0.01, big: 0.1, digits: 2, live: 'rawTps1Primary', hint: 'Solte o pedal e toque em "Usar agora".' },
    { name: 'tpsMax', label: 'Borboleta toda aberta', unit: 'V', step: 0.01, big: 0.1, digits: 2, live: 'rawTps1Primary', hint: 'Pise no fundo (motor desligado) e toque em "Usar agora".' },
  ] },
  { title: 'Sensor 2 da borboleta (eletrônica)', fields: [
    { name: 'tps1_2AdcChannel', label: 'Entrada', hint: 'Só borboleta eletrônica. "Disabled" = não tem.' },
    { name: 'tps1SecondaryMin', label: 'Borboleta fechada', unit: 'V', step: 0.01, big: 0.1, digits: 2, live: 'rawTps1Secondary' },
    { name: 'tps1SecondaryMax', label: 'Borboleta toda aberta', unit: 'V', step: 0.01, big: 0.1, digits: 2, live: 'rawTps1Secondary' },
  ] },
];
const SENSORES_PRESSAO: SecaoDef[] = [
  { title: 'Pressão de óleo', presets: [
      { label: 'Sensor 0-10 bar (0,5-4,5 V)', values: { oilPressureCurve_enabled: 0, oilPressure_v1: 0.5, oilPressure_value1: 0, oilPressure_v2: 4.5, oilPressure_value2: 1000 } },
      { label: '150 psi (0,5-4,5 V)', values: { oilPressureCurve_enabled: 0, oilPressure_v1: 0.5, oilPressure_value1: 0, oilPressure_v2: 4.5, oilPressure_value2: 1034 } },
    ], fields: [
    { name: 'oilPressure_hwChannel', label: 'Entrada' },
    { name: 'oilPressureCurve_enabled', label: 'Calibração', labels: { 0: '2 pontos', 1: 'Curva de 8 pontos' }, hint: 'A curva de 8 pontos fica no menu Sensores.' },
    ...pressao2('oilPressure', 'Óleo', 'rawOilPressure').map((f) => ({ ...f, showIf: (v: Record<string, unknown>) => curva8(v, 'oilPressureCurve_enabled') })),
  ] },
  { title: 'Pressão de combustível', presets: [
      { label: 'Sensor 0-10 bar (0,5-4,5 V)', values: { lowPressureFuelCurve_enabled: 0, lowPressureFuel_v1: 0.5, lowPressureFuel_value1: 0, lowPressureFuel_v2: 4.5, lowPressureFuel_value2: 1000 } },
      { label: '150 psi (0,5-4,5 V)', values: { lowPressureFuelCurve_enabled: 0, lowPressureFuel_v1: 0.5, lowPressureFuel_value1: 0, lowPressureFuel_v2: 4.5, lowPressureFuel_value2: 1034 } },
    ], fields: [
    { name: 'lowPressureFuel_hwChannel', label: 'Entrada' },
    { name: 'lowPressureFuelCurve_enabled', label: 'Calibração', labels: { 0: '2 pontos', 1: 'Curva de 8 pontos' }, hint: 'A curva de 8 pontos fica no menu Sensores.' },
    ...pressao2('lowPressureFuel', 'Combustível', 'rawLowFuelPressure').map((f) => ({ ...f, showIf: (v: Record<string, unknown>) => curva8(v, 'lowPressureFuelCurve_enabled') })),
  ] },
];
const SENSORES_TEMP: SecaoDef[] = [
  { title: 'Temperatura do motor', fields: term('clt', 'temperatura do motor'), presets: termPresets('clt') },
  { title: 'Temperatura do ar', fields: term('iat', 'temperatura do ar'), presets: termPresets('iat') },
];
const SENSORES_MAP: SecaoDef[] = [
  { title: 'Sensor MAP', fields: [
    { name: 'map_sensor_hwChannel', label: 'Entrada' },
    { name: 'map_sensor_type', label: 'Modelo do sensor', hint: 'Custom = digitar a pressão em 0 V e em 5 V.' },
    { name: 'map_sensor_lowValue', label: 'Custom: pressão em 0 V', unit: 'kPa', step: 1, big: 10, showIf: (v) => v.map_sensor_type === 0 },
    { name: 'map_sensor_highValue', label: 'Custom: pressão em 5 V', unit: 'kPa', step: 1, big: 10, showIf: (v) => v.map_sensor_type === 0 },
  ] },
  { title: 'Sensor de pressão atmosférica (opcional)', fields: [
    { name: 'baroSensor_hwChannel', label: 'Entrada', hint: 'Sem sensor, a ECU lê a pressão atmosférica pelo MAP ao ligar a chave.' },
    { name: 'baroSensor_type', label: 'Modelo do sensor' },
  ] },
];
const SENSORES_VEL: SecaoDef[] = [
  { title: 'Sensor de velocidade', fields: [
    { name: 'vehicleSpeedSensorInputPin', label: 'Entrada' },
    { name: 'vssToothCount', label: 'Dentes por volta do sensor', step: 1, big: 10 },
    { name: 'vssGearRatio', label: 'Relação entre o sensor e a roda', step: 0.01, big: 0.1, digits: 3, hint: 'Sensor no câmbio: relação do diferencial. Sensor na roda: 1,000.' },
    { name: 'driveWheelRevPerKm', label: 'Voltas da roda por km', step: 1, big: 10, hint: 'Pneu 195/55 R15: cerca de 530 voltas por km.' },
  ] },
];
const SENSORES_MARCHA: SecaoDef[] = [
  { title: 'Detecção de marcha pela rotação e velocidade', fields: [
    { name: 'totalGearsCount', label: 'Número de marchas', step: 1, big: 1 },
    { name: 'finalGearRatio', label: 'Relação do diferencial', step: 0.01, big: 0.1, digits: 2 },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ name: `gearRatio${n}`, label: `Relação da ${n}ª marcha`, step: 0.01, big: 0.1, digits: 2, showIf: (v: Record<string, unknown>) => Number(v.totalGearsCount || 6) >= n })),
  ] },
];
const SENSORES_OUTROS: SecaoDef[] = [
  { title: 'Sonda lambda (0-5 V)', fields: [
    { name: 'afr_type', label: 'Condicionador da sonda', hint: 'Sonda pela CAN (condicionador de sonda): ligue em Rede CAN para painéis.' },
  ] },
  { title: 'Flex fuel (% de etanol)', fields: [
    { name: 'flexSensorPin', label: 'Entrada do sensor de etanol' },
  ] },
  { title: 'Temperatura do intercooler (depois do turbo)', fields: term('compressorDischargeTemperature', 'temperatura do intercooler'), presets: termPresets('compressorDischargeTemperature') },
];
const TURBO: SecaoDef[] = [
  { title: 'Controle de turbo', fields: [
    { name: 'isBoostControlEnabled', label: 'Controle de turbo', labels: DESL_LIG },
    { name: 'boostType', label: 'Tipo de controle', labels: { 0: 'Malha aberta (duty)', 1: 'Malha aberta + fechada (alvo)' } },
    { name: 'boostPwmFrequency', label: 'Frequência da válvula', unit: 'Hz', step: 1, big: 10 },
  ] },
  { title: 'Só controla acima de', fields: [
    { name: 'boostControlMinRpm', label: 'Rotação mínima', unit: 'RPM', step: 100, big: 500 },
    { name: 'boostControlMinTps', label: 'Borboleta mínima', unit: '%', step: 1, big: 10 },
    { name: 'boostControlMinMap', label: 'MAP mínimo', unit: 'kPa', step: 1, big: 10 },
    { name: 'boostCutPressure', label: 'Corte por excesso de pressão', unit: 'kPa', step: 5, big: 20 },
  ] },
];
export const Turbo = () => <Formulario sections={TURBO} />;


export const ConfigMotor = () => <Formulario sections={MOTOR} />;
export const SinalRpm = () => <Formulario sections={SINAL_RPM} />;
export const OutrasFuncoes = () => <Formulario sections={OUTRAS} />;

// Telas internas de configuração (tela f_<chave>).
export const FORMS: Record<string, { title: string; sections: SecaoDef[] }> = {
  malha: { title: 'Malha fechada (sonda)', sections: [
    { title: 'Correção pela sonda', fields: [
      { name: 'fuelClosedLoopCorrectionEnabled', label: 'Malha fechada', labels: DESL_LIG },
      { name: 'stft_minRpm', label: 'Só acima de', unit: 'RPM', step: 100, big: 500 },
      { name: 'stft_maxRpm', label: 'Só abaixo de', unit: 'RPM', step: 100, big: 500 },
      { name: 'stft_startupDelay', label: 'Espera depois de ligar', unit: 's', step: 1, big: 10 },
      { name: 'stft_shiftPauseTime', label: 'Pausa depois da troca de marcha', unit: 's', step: 0.1, big: 1, digits: 1 },
    ] },
    { title: 'Limites da correção', fields: [
      { name: 'stftLimitsByMap', label: 'Limites', labels: { 0: 'Por região', 1: 'Por MAP' } },
      { name: 'stft_cellCfgs3_maxAdd', label: 'Pode adicionar até (carga)', unit: '%', step: 0.5, big: 5, digits: 1 },
      { name: 'stft_cellCfgs3_maxRemove', label: 'Pode tirar até (carga)', unit: '%', step: 0.5, big: 5, digits: 1 },
      { name: 'stft_deadband', label: 'Zona morta', unit: '%', step: 0.1, big: 1, digits: 1 },
      { name: 'cylinderLambdaTrimEnabled', label: 'Igualar a mistura por cilindro', labels: SIM_NAO, only: [1, 0], hint: 'Precisa da lambda de cada cilindro pela rede CAN.' },
      { name: 'cylLambdaTrimMax', label: 'Correção máxima por cilindro', unit: '%', step: 0.5, big: 2, digits: 1 },
      { name: 'cylLambdaTrimGain', label: 'Velocidade da correção', unit: '%/s', step: 0.1, big: 1, digits: 1 },
    ] },
  ] },
  partida: { title: 'Partida', sections: [
    { title: 'Afogado e óleo', fields: [
      { name: 'floodClearTps', label: 'Desafogar: borboleta acima de', unit: '%', step: 1, big: 10 },
      { name: 'oilPressureStartTimeout', label: 'Tempo para criar pressão de óleo', unit: 's', step: 1, big: 5 },
      { name: 'oilRestartLockTime', label: 'Bloqueio de nova partida', unit: 's', step: 1, big: 10 },
    ] },
  ] },
  partidaFrio: { title: 'Auxílio de partida a frio', sections: [
    { title: 'Bico de partida a frio', fields: [
      { name: 'coldStartInjectorMaxClt', label: 'Funciona abaixo de', unit: '°C', step: 1, big: 10 },
      { name: 'coldStartInjectorAfterStart', label: 'Continua depois de pegar', unit: 's', step: 0.1, big: 1, digits: 1 },
      { name: 'coldStartInjectorPeriod', label: 'Pulsa a cada', unit: 'ms', step: 10, big: 100 },
    ] },
  ] },
  knock: { title: 'Detonação (knock)', sections: [
    { title: 'Retardo por detonação', fields: [
      { name: 'knockRetardPerCylinder', label: 'Atrasar', labels: { 0: 'Todos os cilindros', 1: 'Só o cilindro que bateu' } },
      { name: 'knockRetardAggression', label: 'Quanto atrasa por batida', unit: '%', step: 0.1, big: 1, digits: 1 },
      { name: 'knockRetardReapplyRate', label: 'Volta o avanço a', unit: '°/s', step: 0.1, big: 1, digits: 1 },
      { name: 'knockFrequency', label: 'Frequência do sensor', unit: 'Hz', step: 100, big: 1000 },
    ] },
  ] },
  etb: { title: 'Borboleta eletrônica', sections: [
    { title: 'Religar sozinha depois de falha', fields: [
      { name: 'etbMaximumPosition', label: 'Abertura máxima da borboleta', unit: '%', step: 1, big: 10, hint: 'De 2 a 100 %. Serve para limitar a potência.' },
      { name: 'etbAutoRecoverEnabled', label: 'Religar sozinha', labels: DESL_LIG },
      { name: 'etbAutoRecoverDelay', label: 'Espera antes de tentar', unit: 's', step: 0.1, big: 1, digits: 1 },
      { name: 'etbAutoRecoverMaxTries', label: 'Tentativas', step: 1, big: 5 },
      { name: 'etbSpeedLimitEnabled', label: 'Limitar a velocidade com motor frio', labels: DESL_LIG },
    ] },
    { title: 'Blip na redução de marcha', fields: [
      { name: 'blipThrottleAdd', label: 'Abre a mais', unit: '%', step: 1, big: 10 },
      { name: 'blipDuration', label: 'Por quanto tempo', unit: 'ms', step: 10, big: 100 },
      { name: 'blipMinRpm', label: 'Só acima de', unit: 'RPM', step: 100, big: 500 },
    ] },
  ] },
  can: { title: 'Rede CAN para painéis', sections: [
    { title: 'Enviar para módulos externos', fields: [
      { name: 'ftcanRealtimeData', label: 'Enviar dados ao vivo (painel, datalogger)', labels: SIM_NAO, only: [1, 0] },
      { name: 'ftcanAsFt500', label: 'Aparecer como', labels: { 0: 'Padrão', 1: 'Compatível com painel antigo' } },
    ] },
    { title: 'Receber de módulos externos', fields: [
      { name: 'ftcanReceiveEnabled', label: 'Receber (sonda, EGT, sensores)', labels: SIM_NAO, only: [1, 0] },
      { name: 'ftcanEgtEnabled', label: 'EGT pela rede', labels: SIM_NAO, only: [1, 0] },
    ] },
  ] },
  // referência cap. 19.30: anti-lag (ALS da rusEFI). As 3 tabelas ficam em Outras funções (t_alsPonto, t_alsComb, t_alsCorte).
  // manual de referência cap. 20.11 (nitro progressivo), 20.32 (troca de marcha sem tirar o pé) e 20.34 (wastegate eletrônica).
  nitro: { title: 'Controle de nitro', sections: [
    { title: 'Liga', fields: [
      { name: 'nitrousControlEnabled', label: 'Nitro', labels: DESL_LIG },
      { name: 'nitrousControlArmingMethod', label: 'Como arma', labels: { 0: 'Botão/chave', 1: 'Valor de script Lua' }, showIf: (v) => v.nitrousControlEnabled === 1 },
      { name: 'nitrousControlTriggerPin', label: 'Botão/chave do nitro', showIf: (v) => v.nitrousControlEnabled === 1 },
      { name: 'nitrousRelayPin', label: 'Saída do solenoide (relé)', showIf: (v) => v.nitrousControlEnabled === 1 },
    ] },
    { title: 'Quando entra', fields: [
      { name: 'nitrousActivationRpm', label: 'Entra a partir de', unit: 'rpm', step: 100, big: 500 },
      { name: 'nitrousDeactivationRpm', label: 'Sai acima de', unit: 'rpm', step: 100, big: 500 },
      { name: 'nitrousDeactivationRpmWindow', label: 'Janela para sair', unit: 'rpm', step: 50, big: 200 },
      { name: 'nitrousMinimumTps', label: 'Borboleta mínima', unit: '%', step: 1, big: 10 },
      { name: 'nitrousMinimumClt', label: 'Motor no mínimo a', unit: '°C', step: 1, big: 10 },
      { name: 'nitrousMaximumMap', label: 'Pressão máxima (MAP)', unit: 'kPa', step: 5, big: 20 },
      { name: 'nitrousMinimumVehicleSpeed', label: 'Velocidade mínima', unit: 'km/h', step: 1, big: 10 },
    ] },
    { title: 'Correções com o nitro', fields: [
      { name: 'nitrousFuelAdderPercent', label: 'Combustível a mais', unit: '%', step: 1, big: 5 },
      { name: 'nitrousIgnitionRetard', label: 'Retardo de ponto', unit: '°', step: 0.5, big: 2 },
    ] },
  ] },
  trocaRapida: { title: 'Troca de marcha sem tirar o pé', sections: [
    { title: 'Liga', fields: [
      { name: 'torqueReductionEnabled', label: 'Corte na troca', labels: DESL_LIG },
      { name: 'torqueReductionActivationMode', label: 'Como liga', labels: { 0: 'Botão de corte (na alavanca)', 1: 'Botão de largada', 2: 'Embreagem pressionada', 3: 'Embreagem solta' }, showIf: (v) => v.torqueReductionEnabled === 1 },
      { name: 'torqueReductionTriggerPin', label: 'Sensor/botão da alavanca', showIf: (v) => v.torqueReductionEnabled === 1 },
    ] },
    { title: 'Quando corta', fields: [
      { name: 'torqueReductionArmingRpm', label: 'Arma a partir de', unit: 'rpm', step: 100, big: 500 },
      { name: 'torqueReductionArmingApp', label: 'Pedal mínimo', unit: '%', step: 1, big: 10 },
      { name: 'torqueReductionActivationTemperature', label: 'Motor no mínimo a', unit: '°C', step: 1, big: 10 },
    ] },
  ] },
  wastegateEletronica: { title: 'Wastegate eletrônica', sections: [
    { title: 'Liga', fields: [
      { name: 'etbFunctions2', label: 'Uso do 2º motor de borboleta', labels: { 0: 'Nenhum', 4: 'Wastegate eletrônica' }, only: [0, 4] },
      { name: 'wastegatePositionSensor', label: 'Sensor de posição da wastegate' },
      { name: 'wastegatePositionClosedVoltage', label: 'Tensão fechada', unit: 'V', step: 0.01, big: 0.1 },
      { name: 'wastegatePositionOpenedVoltage', label: 'Tensão aberta', unit: 'V', step: 0.01, big: 0.1 },
    ] },
    { title: 'PID', fields: [
      { name: 'etbWastegatePid_pFactor', label: 'P', step: 0.1, big: 1 },
      { name: 'etbWastegatePid_iFactor', label: 'I', step: 0.1, big: 1 },
      { name: 'etbWastegatePid_dFactor', label: 'D', step: 0.01, big: 0.1 },
      { name: 'etbWastegatePid_minValue', label: 'Mínimo', unit: '%', step: 1, big: 10 },
      { name: 'etbWastegatePid_maxValue', label: 'Máximo', unit: '%', step: 1, big: 10 },
    ] },
  ] },
  antilag: { title: 'Anti-lag', sections: [
    { title: 'Liga', fields: [
      { name: 'antiLagEnabled', label: 'Anti-lag', labels: DESL_LIG },
      { name: 'antiLagActivationMode', label: 'Como liga', labels: { 0: 'Por botão/chave', 1: 'Sempre que as condições baterem' }, only: [0, 1], showIf: (v) => v.antiLagEnabled === 1 },
      { name: 'ALSActivatePin', label: 'Botão/chave do anti-lag', showIf: (v) => v.antiLagEnabled === 1 && v.antiLagActivationMode === 0 },
      { name: 'ALSMaxDuration', label: 'Desliga sozinho depois de', unit: 's', step: 1, big: 2, showIf: (v) => v.antiLagEnabled === 1 },
    ] },
    { title: 'Quando funciona', fields: [
      { name: 'ALSMaxTPS', label: 'Só com borboleta abaixo de', unit: '%', step: 1, big: 5 },
      { name: 'ALSMinRPM', label: 'Rotação mínima', unit: 'RPM', step: 100, big: 500 },
      { name: 'ALSMaxRPM', label: 'Rotação máxima', unit: 'RPM', step: 100, big: 500 },
      { name: 'ALSMinCLT', label: 'Temperatura do motor mínima', unit: '°C', step: 1, big: 10 },
      { name: 'ALSMaxCLT', label: 'Temperatura do motor máxima', unit: '°C', step: 1, big: 10 },
    ].map(alsOn) },
    { title: 'Ar a mais', fields: [
      { name: 'ALSIdleAdd', label: 'Abertura a mais na válvula de lenta', unit: '%', step: 1, big: 5 },
      { name: 'ALSEtbAdd', label: 'Abertura a mais na borboleta eletrônica', unit: '%', step: 1, big: 5 },
    ].map(alsOn) },
  ] },
  turboExtra: { title: 'Turbo na largada, anti-lag e CO2', sections: [
    { title: 'Turbo na largada (2-step) e anti-lag', fields: [
      { name: 'launchBoostOverride', label: 'Valor próprio na largada', labels: SIM_NAO, only: [1, 0] },
      { name: 'launchBoostDuty', label: 'Duty na largada', unit: '%', step: 1, big: 10 },
      { name: 'launchBoostTarget', label: 'Alvo na largada', unit: 'kPa', step: 5, big: 20 },
      { name: 'antilagBoostOverride', label: 'Valor próprio no anti-lag', labels: SIM_NAO, only: [1, 0] },
      { name: 'antilagBoostDuty', label: 'Duty no anti-lag', unit: '%', step: 1, big: 10 },
      { name: 'antilagBoostTarget', label: 'Alvo no anti-lag', unit: 'kPa', step: 5, big: 20 },
    ] },
    { title: 'Válvula parada e alvo por tempo', fields: [
      { name: 'boostRestEnabled', label: 'Posição da válvula fora do controle', labels: SIM_NAO, only: [1, 0] },
      { name: 'boostRestPosition', label: 'Posição parada', unit: '%', step: 1, big: 10 },
      { name: 'boostByTimeEnabled', label: 'Alvo por tempo depois da largada', labels: DESL_LIG },
    ] },
    { title: 'Controle por CO2 (domo da wastegate)', fields: [
      { name: 'domeControlEnabled', label: 'Controle por CO2', labels: DESL_LIG },
      { name: 'domeTargetOffset', label: 'Pressão no domo em relação ao alvo', unit: 'kPa', step: 1, big: 10 },
      { name: 'domeControlBand', label: 'Faixa sem correção', unit: 'kPa', step: 1, big: 5 },
      { name: 'domeMaxPressure', label: 'Pressão máxima no domo', unit: 'kPa', step: 5, big: 20 },
    ] },
  ] },
  sdlog: { title: 'Log no cartão SD', sections: [
    { title: 'Quando gravar', fields: [
      { name: 'sdLogStartRpm', label: 'Começa acima de', unit: 'RPM', step: 100, big: 500 },
      { name: 'sdLogStopRpm', label: 'Para abaixo de', unit: 'RPM', step: 100, big: 500 },
      { name: 'sdLogStopDelay', label: 'Espera antes de parar', unit: 's', step: 1, big: 10 },
      { name: 'sdLogMinTps', label: 'Borboleta mínima', unit: '%', step: 1, big: 10 },
    ] },
    { title: 'Cartão', fields: [
      { name: 'sdLogKeepFreeMb', label: 'Manter livre (apaga os mais velhos)', unit: 'MB', step: 10, big: 100 },
      { name: 'sdLogSaveTune', label: 'Salvar o ajuste junto com o log', labels: SIM_NAO, only: [1, 0] },
    ] },
  ] },
  pedal: { title: 'Pedal do acelerador', sections: [
    { title: 'Sensor 1 do pedal', fields: [
      { name: 'throttlePedalPositionAdcChannel', label: 'Entrada' },
      { name: 'throttlePedalUpVoltage', label: 'Pedal solto', unit: 'V', step: 0.01, big: 0.1, digits: 2, live: 'rawPpsPrimary', hint: 'Solte o pedal e toque em "Usar agora".' },
      { name: 'throttlePedalWOTVoltage', label: 'Pedal no fundo', unit: 'V', step: 0.01, big: 0.1, digits: 2, live: 'rawPpsPrimary', hint: 'Pise no fundo e toque em "Usar agora".' },
    ] },
    { title: 'Sensor 2 do pedal (conferência)', fields: [
      { name: 'throttlePedalSecondaryUpVoltage', label: 'Pedal solto', unit: 'V', step: 0.01, big: 0.1, digits: 2, live: 'rawPpsSecondary' },
      { name: 'throttlePedalSecondaryWOTVoltage', label: 'Pedal no fundo', unit: 'V', step: 0.01, big: 0.1, digits: 2, live: 'rawPpsSecondary' },
    ] },
  ] },
  sensTps: { title: 'Borboleta (TPS)', sections: SENSORES_TPS },
  sensPressao: { title: 'Pressão de óleo e de combustível', sections: SENSORES_PRESSAO },
  sensTemp: { title: 'Temperatura do motor e do ar', sections: SENSORES_TEMP },
  sensMap: { title: 'Sensor MAP', sections: SENSORES_MAP },
  sensVel: { title: 'Velocidade', sections: SENSORES_VEL },
  sensMarcha: { title: 'Detecção de marcha', sections: SENSORES_MARCHA },
  sensOutros: { title: 'Sonda, flex fuel e intercooler', sections: SENSORES_OUTROS },
  atuadorLenta: { title: 'Atuador de marcha lenta', sections: [
    { title: 'Tipo de atuador', fields: [
      { name: 'useStepperIdle', label: 'Atuador', labels: { 0: 'Válvula PWM (ou borboleta eletrônica)', 1: 'Motor de passo' }, hint: 'Com borboleta eletrônica a lenta é feita pela própria borboleta: escolha Válvula PWM e deixe o pino em "Nenhum". Sem atuador, a lenta fica só pelo ponto (Outras funções > Marcha lenta).' },
    ] },
    { title: 'Válvula PWM', fields: [
      { name: 'idle_solenoidPin', label: 'Saída da válvula', showIf: (v) => v.useStepperIdle === 0 },
      { name: 'idle_solenoidFrequency', label: 'Frequência', unit: 'Hz', step: 10, big: 100, showIf: (v) => v.useStepperIdle === 0, hint: 'Atuadores pequenos: perto de 2000 Hz. Grandes ou simples: 50 a 100 Hz. Se fizer barulho, aumente.' },
      { name: 'isDoubleSolenoidIdle', label: 'Válvula de duas bobinas', labels: SIM_NAO, only: [1, 0], showIf: (v) => v.useStepperIdle === 0, hint: 'Subaru, BMW e alguns Mazda: uma bobina abre, a outra fecha.' },
      { name: 'secondSolenoidPin', label: 'Saída da segunda bobina', showIf: (v) => v.useStepperIdle === 0 && v.isDoubleSolenoidIdle === 1 },
    ] },
    { title: 'Motor de passo', fields: [
      { name: 'idleStepperTotalSteps', label: 'Número de passos', step: 10, big: 50, showIf: (v) => v.useStepperIdle === 1, hint: 'GM: 210 passos. VW: 260 passos.' },
      { name: 'useRawOutputToDriveIdleStepper', label: 'Ligação', labels: { 1: 'Direto em 4 saídas da placa', 0: 'Driver externo (passo e direção)' }, only: [1, 0], showIf: (v) => v.useStepperIdle === 1 },
      ...[1, 2, 3, 4].map((n) => ({ name: `stepper_raw_output${n}`, label: `Bobina ${n} do motor de passo`, showIf: (v: Record<string, unknown>) => v.useStepperIdle === 1 && v.useRawOutputToDriveIdleStepper === 1 })),
      { name: 'idle_stepperStepPin', label: 'Pino de passo', showIf: (v) => v.useStepperIdle === 1 && v.useRawOutputToDriveIdleStepper === 0 },
      { name: 'idle_stepperDirectionPin', label: 'Pino de direção', showIf: (v) => v.useStepperIdle === 1 && v.useRawOutputToDriveIdleStepper === 0 },
      { name: 'stepperEnablePin', label: 'Pino de liga do driver', showIf: (v) => v.useStepperIdle === 1 && v.useRawOutputToDriveIdleStepper === 0 },
      { name: 'stepperForceParkingEveryRestart', label: 'Recalibrar a posição toda vez que ligar', labels: SIM_NAO, only: [1, 0], showIf: (v) => v.useStepperIdle === 1 },
      { name: 'stepperMinDutyCycle', label: 'Corrente com o motor parado (0 = desenergiza ao chegar na posição)', unit: '%', step: 5, big: 25, showIf: (v) => v.useStepperIdle === 1 },
    ] },
  ] },
  fase: { title: 'Sensor de fase (comando)', sections: [
    { title: 'Sensor de fase', fields: [
      ...FASE_FIELDS,
      { name: 'camSensorType1', label: 'Tipo de sensor', labels: VR_HALL },
      { name: 'invertCamVVTSignal', label: 'Borda', labels: { 0: 'Subida', 1: 'Descida' }, hint: 'Se o motor funcionar com a ordem errada, troque a borda.' },
      { name: 'camSyncOnlyAtStart', label: 'Usar a fase', labels: { 0: 'Sempre', 1: 'Só na partida' }, hint: 'Só na partida: se o sensor falhar com o motor ligado, ele continua funcionando.' },
    ] },
  ] },
  bicos: { title: 'Injeção', sections: [
    { title: 'Bicos', fields: [
      { name: 'injector_flow', label: 'Vazão de cada bico', unit: 'cc/min', step: 10, big: 100 },
      { name: 'injectionMode', label: 'Modo de injeção', labels: INJ_MODO },
      { name: 'crankingInjectionMode', label: 'Injeção na partida', labels: INJ_MODO },
    ] },
    { title: 'Momento da injeção', fields: [
      { name: 'injectionTimingMode', label: 'O ângulo da tabela marca', labels: { 0: 'O fim da injeção', 1: 'O começo da injeção', 2: 'O meio da injeção' }, hint: 'O ângulo fica na tabela "Ângulo de injeção".' },
    ] },
  ] },
  accel: { title: 'Injeção rápida e decaimento', sections: [
    { title: 'Injeção rápida (acelerando)', fields: [
      { name: 'accelEnrichmentMode', label: 'Modo', labels: { 0: 'Tempo a mais (ms)', 1: 'Percentual a mais', 2: 'Previsão pelo MAP' }, only: [0, 1, 2] },
      { name: 'tpsAccelEnrichmentThreshold', label: 'Entra quando a borboleta abre mais de', unit: '%', step: 1, big: 5, digits: 1 },
      { name: 'tpsAccelFractionPeriod', label: 'Espalha por', unit: 'ciclos', step: 1, big: 5 },
      { name: 'tpsAccelFractionDivisor', label: 'Decaimento (1 = tudo de uma vez)', step: 0.1, big: 1, digits: 2 },
    ] },
    { title: 'Desaceleração', fields: [
      { name: 'tpsDecelEnleanmentThreshold', label: 'Tira combustível quando a borboleta fecha mais de', unit: '%', step: 1, big: 5, digits: 1 },
      { name: 'tpsDecelEnleanmentMultiplier', label: 'Quanto tira', step: 0.1, big: 1, digits: 2 },
    ] },
  ] },
  limitesPonto: { title: 'Limites de ponto', sections: [
    { title: 'O avanço nunca passa destes limites', fields: [
      { name: 'minimumIgnitionTiming', label: 'Avanço mínimo', unit: '°', step: 1, big: 5 },
      { name: 'maximumIgnitionTiming', label: 'Avanço máximo', unit: '°', step: 1, big: 5 },
    ] },
  ] },
  alertaSaida: { title: 'Saída de alerta', sections: [
    { title: 'Saída de alerta', fields: [
      { name: 'alertOutputPin', label: 'Fio da saída (lâmpada, buzzer, relé)' },
      { name: 'alertOutputPinMode', label: 'Acionamento', labels: { 0: 'Ativo em 0 V (negativo)', 1: 'Ativo em 12 V (invertido)' }, only: [0, 1],
        hint: 'A saída fica ligada até a próxima partida do motor, como nos módulos profissionais.' },
    ] },
  ] },
  ignicao: { title: 'Ignição', sections: [
    { title: 'Modo de ignição', fields: [
      { name: 'ignitionMode', label: 'Modo', labels: { 0: 'Distribuidor (uma bobina)', 1: 'Sequencial (bobina por cilindro)', 2: 'Centelha perdida', 3: 'Dois distribuidores' } },
      { name: 'ignitionPinMode', label: 'Saída de ignição', labels: { 0: 'Normal (bobina com módulo)', 1: 'Invertida' } },
    ] },
    { title: 'Partida', fields: [
      { name: 'crankingTimingAngle', label: 'Avanço na partida', unit: '°', step: 1, big: 5, hint: 'Curvas de avanço na partida ficam em Mapas de ignição.' },
    ] },
  ] },
  lenta: { title: 'Controle de lenta', sections: [
    { title: 'Controle', fields: [
      { name: 'idleMode', label: 'Modo', labels: { 0: 'Malha fechada (segue a rotação alvo)', 1: 'Só malha aberta (posição fixa)' } },
      { name: 'idlePidRpmUpperLimit', label: 'Controla até a rotação alvo +', unit: 'RPM', step: 50, big: 200 },
      { name: 'idlePidRpmDeadZone', label: 'Zona morta', unit: 'RPM', step: 10, big: 50 },
      { name: 'idleRpmPid_pFactor', label: 'P', step: 0.01, big: 0.1, digits: 3, showIf: (v) => v.idleMode === 0 },
      { name: 'idleRpmPid_iFactor', label: 'I', step: 0.01, big: 0.1, digits: 3, showIf: (v) => v.idleMode === 0 },
      { name: 'idleRpmPid_dFactor', label: 'D', step: 0.01, big: 0.1, digits: 3, showIf: (v) => v.idleMode === 0 },
      { name: 'idleRpmPid_minValue', label: 'Correção mínima', unit: '%', step: 1, big: 10, showIf: (v) => v.idleMode === 0 },
      { name: 'idleRpmPid_maxValue', label: 'Correção máxima', unit: '%', step: 1, big: 10, showIf: (v) => v.idleMode === 0 },
    ] },
    { title: 'Depois da partida', fields: [
      { name: 'idleAfterStartRpmAdd', label: 'Rotação a mais depois de pegar', unit: 'RPM', step: 50, big: 200 },
      { name: 'idleAfterStartRpmTime', label: 'Vai tirando em', unit: 's', step: 1, big: 10 },
    ] },
    { title: 'Ponto na lenta', fields: [
      { name: 'useIdleTimingPidControl', label: 'Segurar a lenta pelo ponto', labels: SIM_NAO, only: [1, 0] },
      { name: 'idleLoadTimingStep', label: 'Ponto a mais quando liga A/C ou ventoinha', unit: '°', step: 1, big: 5 },
      { name: 'idleLoadTimingStepTime', label: 'Por quanto tempo', unit: 's', step: 0.5, big: 2, digits: 1 },
      { name: 'idleTimingExitRampTime', label: 'Saída suave da lenta', unit: 's', step: 0.1, big: 1, digits: 1 },
    ] },
  ] },
  ventoinhas: { title: 'Eletroventiladores', sections: [
    { title: 'Ventoinhas', fields: [
      { name: 'fan1TempSource', label: 'Ventoinha 1 segue', labels: { 0: 'Temp. do motor', 1: 'Temp. do ar', 2: 'Temp. do óleo', 3: 'Temp. auxiliar 1', 4: 'Temp. auxiliar 2' } },
      { name: 'fan2TempSource', label: 'Ventoinha 2 segue', labels: { 0: 'Temp. do motor', 1: 'Temp. do ar', 2: 'Temp. do óleo', 3: 'Temp. auxiliar 1', 4: 'Temp. auxiliar 2' } },
      { name: 'fanOnTemperature', label: 'Ventoinha 1 liga em', unit: '°C', step: 1, big: 5 },
      { name: 'fanOffTemperature', label: 'Ventoinha 1 desliga em', unit: '°C', step: 1, big: 5 },
      { name: 'fan2OnTemperature', label: 'Ventoinha 2 liga em', unit: '°C', step: 1, big: 5 },
      { name: 'fan2OffTemperature', label: 'Ventoinha 2 desliga em', unit: '°C', step: 1, big: 5 },
    ] },
    { title: 'Combustível a mais com carga elétrica', fields: [
      { name: 'fan1ExtraFuel', label: 'Com ventoinha 1', unit: '%', step: 1, big: 5 },
      { name: 'fan2ExtraFuel', label: 'Com ventoinha 2', unit: '%', step: 1, big: 5 },
      { name: 'fan1ExtraIdle', label: 'Lenta: atuador a mais com ventoinha 1', unit: '%', step: 1, big: 5 },
      { name: 'fan2ExtraIdle', label: 'Lenta: atuador a mais com ventoinha 2', unit: '%', step: 1, big: 5 },
    ] },
  ] },
  arCondicionado: { title: 'Ar condicionado', sections: [
    { title: 'Quando liga', fields: [
      { name: 'acDelay', label: 'Espera para ligar o compressor', unit: 's', step: 0.1, big: 1, digits: 1 },
      { name: 'maxAcClt', label: 'Desliga com motor acima de', unit: '°C', step: 1, big: 5 },
      { name: 'maxAcTps', label: 'Desliga com borboleta acima de', unit: '%', step: 1, big: 10 },
    ] },
    { title: 'Compensações', fields: [
      { name: 'acExtraFuel', label: 'Combustível a mais', unit: '%', step: 1, big: 5 },
      { name: 'acIdleExtraOffset', label: 'Lenta: atuador a mais', unit: '%', step: 1, big: 5 },
      { name: 'acIdleRpmTarget', label: 'Lenta: rotação com A/C', unit: 'RPM', step: 50, big: 200 },
    ] },
  ] },
  vtec: { title: 'Comando variável (VTEC)', sections: [
    { title: 'VTEC', fields: [
      { name: 'vvlController_activationRpm', label: 'Liga em', unit: 'RPM', step: 100, big: 500 },
      { name: 'vvlController_deactivationRpm', label: 'Desliga em', unit: 'RPM', step: 100, big: 500 },
      { name: 'vvlController_minimumClt', label: 'Motor acima de', unit: '°C', step: 1, big: 10 },
      { name: 'vvlController_minimumTps', label: 'Borboleta acima de', unit: '%', step: 1, big: 10 },
      { name: 'vvlController_minimumOilPressure', label: 'Pressão de óleo mínima', unit: 'kPa', step: 10, big: 50 },
    ] },
  ] },
  bomba: { title: 'Bomba de combustível', sections: [
    { title: 'Bomba de combustível', fields: [
      { name: 'startUpFuelPumpDuration', label: 'Liga ao ligar a chave por', unit: 's', step: 1, big: 5, hint: 'Depois fica ligada só com o motor girando. O fio da bomba fica em Configuração do motor > Pinos.' },
    ] },
  ] },
  contagiros: { title: 'Saída para conta-giros', sections: [
    { title: 'Conta-giros', fields: [
      { name: 'tachPulsePerRev', label: 'Pulsos por volta do motor', step: 0.5, big: 1, digits: 1, hint: '4 cilindros: 2. 6 cilindros: 3. 8 cilindros: 4.' },
      { name: 'tachPulseDuractionMs', label: 'Duração do pulso', unit: 'ms', step: 0.5, big: 2, digits: 1 },
    ] },
  ] },
  botaoPartida: { title: 'Botão de partida', sections: [
    { title: 'Botão de partida', fields: [
      { name: 'startStopButtonPin', label: 'Entrada do botão' },
      { name: 'startStopButtonMode', label: 'Acionamento do botão' },
      { name: 'starterControlPin', label: 'Saída do relé do motor de partida' },
      { name: 'startCrankingDuration', label: 'Tempo máximo girando o motor de partida', unit: 's', step: 1, big: 5 },
    ] },
  ] },
  desaceleracao: { title: 'Corte na desaceleração', sections: [
    { title: 'Corte de combustível ao soltar o pedal', fields: [
      { name: 'coastingFuelCutEnabled', label: 'Corte na desaceleração', labels: DESL_LIG },
      { name: 'coastingFuelCutRpmHigh', label: 'Corta acima de', unit: 'RPM', step: 100, big: 500 },
      { name: 'coastingFuelCutRpmLow', label: 'Volta a injetar abaixo de', unit: 'RPM', step: 100, big: 500 },
      { name: 'coastingFuelCutTps', label: 'Só com borboleta abaixo de', unit: '%', step: 1, big: 5 },
      { name: 'coastingFuelCutMap', label: 'Só com MAP abaixo de', unit: 'kPa', step: 1, big: 10 },
      { name: 'coastingFuelCutClt', label: 'Só com motor acima de', unit: '°C', step: 1, big: 10 },
    ] },
  ] },
  vvt: { title: 'Comando variável (VVT)', sections: [
    { title: 'Válvula do comando de admissão', fields: [
      { name: 'vvtPins1', label: 'Saída da válvula' },
      { name: 'vvtOutputFrequency', label: 'Frequência', unit: 'Hz', step: 10, big: 50 },
      { name: 'invertVvtControlIntake', label: 'Inverter o sentido', labels: SIM_NAO, only: [0, 1] },
    ] },
    { title: 'Quando controla', fields: [
      { name: 'vvtControlMinRpm', label: 'Acima de', unit: 'RPM', step: 100, big: 500 },
      { name: 'vvtControlMinClt', label: 'Motor acima de', unit: '°C', step: 1, big: 10 },
      { name: 'vvtActivationDelayMs', label: 'Espera depois de pegar', unit: 'ms', step: 100, big: 1000 },
    ] },
    { title: 'Controle (PID)', fields: [
      { name: 'auxPid1_pFactor', label: 'P', step: 0.01, big: 0.1, digits: 3 },
      { name: 'auxPid1_iFactor', label: 'I', step: 0.01, big: 0.1, digits: 3 },
      { name: 'auxPid1_dFactor', label: 'D', step: 0.01, big: 0.1, digits: 3 },
      { name: 'auxPid1_offset', label: 'Duty base', unit: '%', step: 1, big: 10 },
      { name: 'auxPid1_minValue', label: 'Duty mínimo', unit: '%', step: 1, big: 10 },
      { name: 'auxPid1_maxValue', label: 'Duty máximo', unit: '%', step: 1, big: 10 },
    ] },
  ] },
  shiftLight: { title: 'Shift light', sections: [
    { title: 'Rotação de troca por marcha', fields: [
      { name: 'shiftLightRpm1', label: 'Sem marcha / neutro', unit: 'RPM', step: 100, big: 500, hint: 'Vale também quando a detecção de marcha está desligada ou a marcha ficou em 0. Tudo em 0 = shift light desligado.' },
      ...[1, 2, 3, 4, 5, 6].map((g): CampoDef => ({ name: `shiftLightRpm${g + 1}`, label: `${g}ª marcha (0 = igual a sem marcha)`, unit: 'RPM', step: 100, big: 500 })),
    ] },
    { title: 'Barra de LEDs e tela', fields: [
      { name: 'shiftLightPreRpm', label: 'Barra de LEDs começa antes da troca', unit: 'RPM', step: 100, big: 500, hint: 'A barra acende aos poucos até a rotação de troca; na troca a tela do painel pisca.' },
    ] },
    { title: 'Lâmpada', fields: [
      { name: 'shiftLightPin', label: 'Saída da lâmpada' },
      { name: 'shiftLightPinMode', label: 'Acionamento', showIf: (v) => !!v.shiftLightPin },
      { name: 'shiftLightBlinkHz', label: 'Piscar (0 = fixa)', unit: 'Hz', step: 1, big: 5, showIf: (v) => !!v.shiftLightPin },
    ] },
  ] },
  wmi: { title: 'Injeção de água/metanol', sections: [
    { title: 'Saída', presetsLabel: 'Modelo pronto:', presets: [
      { label: 'Kit na Saída PWM 8 (30 Hz, MAP × RPM)', values: { wmiGppwmChannel: 8, gppwm8_pwmFrequency: 30, gppwm8_loadAxis: 2, gppwm8_rpmAxis: 24, wmiActiveDuty: 10, wmiLevelDelay: 2, wmiTimingAdd: 3, wmiFuelTrim: -5 } },
    ], fields: [
      { name: 'wmiGppwmChannel', label: 'Saída PWM usada (0 = desligado)', step: 1, big: 1, hint: 'Configure uma Saída PWM programável para a válvula ou bomba (pino, frequência, tabela MAP × RPM) e escolha o número dela aqui. O modelo pronto já prepara a Saída PWM 8; falta o pino e a tabela de duty.' },
      { name: 'wmiActiveDuty', label: 'Conta como injetando acima de', unit: '%', step: 1, big: 5, showIf: (v) => !!v.wmiGppwmChannel },
    ] },
    { title: 'Nível do tanque', fields: [
      { name: 'wmiLevelPin', label: 'Entrada da boia (ativa = tanque baixo)', showIf: (v) => !!v.wmiGppwmChannel },
      { name: 'wmiLevelPinMode', label: 'Acionamento da boia', showIf: (v) => !!v.wmiGppwmChannel && !!v.wmiLevelPin },
      { name: 'wmiLevelDelay', label: 'Tempo para confirmar o nível', unit: 's', step: 0.5, big: 2, digits: 1, showIf: (v) => !!v.wmiGppwmChannel && !!v.wmiLevelPin,
        hint: 'Com o tanque baixo a saída desliga (a bomba não roda a seco). Crie um alerta "Falha da água/metanol" para cortar o turbo.' },
    ] },
    { title: 'Correções enquanto injeta', fields: [
      { name: 'wmiTimingAdd', label: 'Avanço a mais com 100 % de duty', unit: '°', step: 0.5, big: 2, digits: 1, showIf: (v) => !!v.wmiGppwmChannel },
      { name: 'wmiFuelTrim', label: 'Combustível com 100 % de duty', unit: '%', step: 1, big: 5, showIf: (v) => !!v.wmiGppwmChannel, hint: 'Proporcional ao duty. Metanol também é combustível: normalmente negativo.' },
    ] },
  ] },
  tracao: { title: 'Controle de tração', sections: [
    { title: 'Velocidade das rodas', fields: [
      { name: 'tcWheelSource', label: 'De onde vem', labels: { 0: 'Desligado', 1: 'Sensores com fio (dianteira e traseira)', 2: 'Rede CAN (ABS ou módulo)' }, only: [0, 1, 2],
        hint: 'Rede CAN: em Sensores > CAN personalizada crie um frame "Receber" com o ID do ABS e ponha cada roda num valor com destino "Velocidade da roda" (km/h). A patinagem age pelas 3 tabelas do controle de tração.' },
      { name: 'tcFrontWheelDrive', label: 'Tração', labels: { 0: 'Traseira', 1: 'Dianteira' }, only: [0, 1], showIf: (v) => !!v.tcWheelSource },
      { name: 'tcMinSpeed', label: 'Só controla acima de', unit: 'km/h', step: 1, big: 5, showIf: (v) => !!v.tcWheelSource, hint: 'Velocidade das rodas livres. Na largada parada quem cuida é o 2-step.' },
    ] },
    { title: 'Sensores com fio', fields: [
      { name: 'auxSpeedSensorInputPin1', label: 'Sensor da roda dianteira', showIf: (v) => v.tcWheelSource === 1 },
      { name: 'tcFrontPulsesPerRev', label: 'Dentes da roda dianteira', step: 1, big: 10, showIf: (v) => v.tcWheelSource === 1 },
      { name: 'auxSpeedSensorInputPin2', label: 'Sensor da roda traseira', showIf: (v) => v.tcWheelSource === 1 },
      { name: 'tcRearPulsesPerRev', label: 'Dentes da roda traseira', step: 1, big: 10, showIf: (v) => v.tcWheelSource === 1 },
      { name: 'tcTireCircumference', label: 'Perímetro do pneu', unit: 'mm', step: 10, big: 100, showIf: (v) => v.tcWheelSource === 1 },
    ] },
    { title: 'Botão', fields: [
      { name: 'tcSwitchPin', label: 'Chave liga/desliga (opcional)', showIf: (v) => !!v.tcWheelSource, hint: 'Com a chave escolhida, o controle só age com ela ligada.' },
      { name: 'tcSwitchPinMode', label: 'Acionamento da chave', showIf: (v) => !!v.tcWheelSource && !!v.tcSwitchPin },
    ] },
  ] },
  troca: { title: 'Troca de marcha', sections: [
    { title: 'Depois da troca de marcha', fields: [
      { name: 'shiftCompMinTps', label: 'Só com borboleta acima de', unit: '%', step: 1, big: 10, hint: 'O retardo e o combustível estão nas tabelas "depois da troca".' },
    ] },
  ] },
  saidas: { title: 'Pinos da placa (saídas e entradas)', sections: [
    { title: 'Bicos', fields: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ name: `injectionPins${n}`, label: `Bico ${n}` })) },
    { title: 'Bobinas', fields: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ name: `ignitionPins${n}`, label: `Bobina ${n}` })) },
    { title: 'Relés e auxiliares', fields: [
      { name: 'mainRelayPin', label: 'Relé principal' }, { name: 'fuelPumpPin', label: 'Bomba de combustível' },
      { name: 'fanPin', label: 'Ventoinha 1' }, { name: 'fan2Pin', label: 'Ventoinha 2' }, { name: 'acRelayPin', label: 'Relé do A/C' },
      { name: 'boostControlPin', label: 'Válvula do turbo' }, { name: 'tachOutputPin', label: 'Conta-giros' },
      { name: 'coldStartInjectorPin', label: 'Bico de partida a frio' },
      { name: 'domeFillPin', label: 'CO2: válvula de encher' }, { name: 'domeVentPin', label: 'CO2: válvula de aliviar' },
    ] },
    { title: 'LED de status (RGB)', fields: [
      { name: 'rgbLedRedPin', label: 'LED vermelho' }, { name: 'rgbLedGreenPin', label: 'LED verde' }, { name: 'rgbLedBluePin', label: 'LED azul' },
    ] },
    { title: 'Botões e troca de ajuste', fields: [
      { name: 'tuneSwitchPin', label: 'Botão de troca de ajuste' },
      { name: 'tuneSelectorChannel', label: 'Troca de ajuste por tensão (entrada analógica)', hint: 'Uma chave de 3 posições com resistores escolhe o ajuste 1, 2 ou 3.' },
      { name: 'blipButtonPin', label: 'Botão do blip na redução' },
      { name: 'acSwitch', label: 'Botão do A/C' },
    ] },
  ] },
};

// Saídas PWM programáveis 1 a 8 (tela f_gppwmN); a tabela é a t_gppwmN.
for (let g = 1; g <= 8; g++) {
  FORMS[`gppwm${g}`] = { title: `Saída PWM ${g}`, sections: [
    { title: 'Saída', fields: [
      { name: `gppwm${g}_pin`, label: 'Pino de saída' },
      { name: `gppwm${g}_pwmFrequency`, label: 'Frequência (0 = liga/desliga)', unit: 'Hz', step: 1, big: 10 },
      { name: `gppwm${g}_onAboveDuty`, label: 'Liga/desliga: liga acima de', unit: '%', step: 1, big: 10 },
      { name: `gppwm${g}_offBelowDuty`, label: 'Liga/desliga: desliga abaixo de', unit: '%', step: 1, big: 10 },
      { name: `gppwm${g}_dutyIfError`, label: 'Se o sensor falhar', unit: '%', step: 1, big: 10 },
    ] },
    { title: 'Eixos da tabela', fields: [
      { name: `gppwm${g}_rpmAxis`, label: 'Eixo X', labels: CANAL },
      { name: `gppwm${g}_loadAxis`, label: 'Eixo Y', labels: CANAL },
    ] },
  ] };
}

// Frames CAN personalizados 1 a 8 (tela f_canN).
for (let n = 1; n <= 8; n++) {
  const k = `customCanFrames${n}_`;
  const val = (v: number): CampoDef[] => [
    { name: `${k}values${v}_source`, label: `Valor ${v}: enviar`, labels: CANAL },
    { name: `${k}values${v}_target`, label: `Valor ${v}: receber em`, labels: { 0: 'Não usado', 1: 'Pressão de óleo', 2: 'Pressão de combustível', 3: 'Temp. do óleo', 4: 'Temp. auxiliar 1', 5: 'Temp. auxiliar 2', 6: 'Nível de combustível', 7: 'Velocidade da roda DE (km/h)', 8: 'Velocidade da roda DD (km/h)', 9: 'Velocidade da roda TE (km/h)', 10: 'Velocidade da roda TD (km/h)' } },
    { name: `${k}values${v}_format`, label: `Valor ${v}: formato`, labels: { 0: 'Sem sinal, big endian', 1: 'Com sinal, big endian', 2: 'Sem sinal, little endian', 3: 'Com sinal, little endian' } },
    { name: `${k}values${v}_scale`, label: `Valor ${v}: multiplicar por`, step: 0.1, big: 1, digits: 3 },
    { name: `${k}values${v}_offset`, label: `Valor ${v}: somar`, step: 1, big: 10, digits: 1 },
  ];
  FORMS[`can${n}`] = { title: `CAN personalizada: frame ${n}`, sections: [
    { title: 'Frame', fields: [
      { name: `${k}mode`, label: 'Modo', labels: { 0: 'Desligado', 1: 'Enviar', 2: 'Receber' } },
      { name: `${k}bus`, label: 'Rede', labels: { 0: 'CAN 1', 1: 'CAN 2', 2: 'CAN 3' } },
      { name: `${k}canId`, label: 'ID do frame (decimal)', step: 1, big: 16 },
      { name: `${k}isExtended`, label: 'ID estendido (29 bits)', step: 1, big: 1 },
      { name: `${k}periodMs`, label: 'Envia a cada / tempo sem receber', unit: 'ms', step: 10, big: 100 },
    ] },
    { title: 'Valores 1 e 2', fields: [...val(1), ...val(2)] },
    { title: 'Valores 3 e 4', fields: [...val(3), ...val(4)] },
  ] };
}
