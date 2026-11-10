// Fios da nossa placa (estilo profissional: cor + número) e o pino do processador de cada um.
// PROVISÓRIO: os pinos de verdade saem do projeto da placa. Mudando aqui, o app inteiro acompanha.
export interface Fio { nome: string; pino: string; tipo: 'saida' | 'entrada' }

const range = (n: number, f: (i: number) => Fio) => Array.from({ length: n }, (_, i) => f(i + 1));
const ADC = ['PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'PB0', 'PB1', 'PC0', 'PC1', 'PC2', 'PC3', 'PC4', 'PC5'];

export const FIOS: Fio[] = [
  ...range(8, (i) => ({ nome: `Azul ${i}`, pino: `PD${7 + i}`, tipo: 'saida' })), // saídas de bico
  ...range(8, (i) => ({ nome: `Cinza ${i}`, pino: `PE${7 + i}`, tipo: 'saida' })), // saídas de bobina
  ...range(8, (i) => ({ nome: `Amarelo ${i}`, pino: `PG${i - 1}`, tipo: 'saida' })), // saídas auxiliares
  ...range(16, (i) => ({ nome: `Branco ${i}`, pino: ADC[i - 1], tipo: 'entrada' })), // entradas de sensor / botão
];

/** Campos de pino que o app conhece: nome no .ini, função em português, saída ou entrada. */
export const PINOS: [string, string, 'saida' | 'entrada'][] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`injectionPins${i}`, `Bico ${i}`, 'saida'] as [string, string, 'saida']),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`ignitionPins${i}`, `Bobina ${i}`, 'saida'] as [string, string, 'saida']),
  ['mainRelayPin', 'Relé principal', 'saida'], ['fuelPumpPin', 'Bomba de combustível', 'saida'], ['fanPin', 'Ventoinha 1', 'saida'], ['fan2Pin', 'Ventoinha 2', 'saida'],
  ['acRelayPin', 'Relé do A/C', 'saida'], ['boostControlPin', 'Válvula do turbo', 'saida'], ['tachOutputPin', 'Conta-giros', 'saida'],
  ['coldStartInjectorPin', 'Bico de partida a frio', 'saida'], ['alertOutputPin', 'Saída de alerta', 'saida'],
  ['domeFillPin', 'CO2: encher', 'saida'], ['domeVentPin', 'CO2: aliviar', 'saida'],
  ['idle_solenoidPin', 'Válvula de lenta', 'saida'], ['secondSolenoidPin', 'Válvula de lenta (2ª bobina)', 'saida'],
  ...[1, 2, 3, 4].map((i) => [`stepper_raw_output${i}`, `Motor de passo ${i}`, 'saida'] as [string, string, 'saida']),
  ['idle_stepperStepPin', 'Motor de passo: passo', 'saida'], ['idle_stepperDirectionPin', 'Motor de passo: direção', 'saida'], ['stepperEnablePin', 'Motor de passo: liga', 'saida'],
  ['rgbLedRedPin', 'LED vermelho', 'saida'], ['rgbLedGreenPin', 'LED verde', 'saida'], ['rgbLedBluePin', 'LED azul', 'saida'],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`gppwm${i}_pin`, `Saída PWM ${i}`, 'saida'] as [string, string, 'saida']),
  ['tps1_1AdcChannel', 'TPS 1', 'entrada'], ['tps1_2AdcChannel', 'TPS 2', 'entrada'], ['throttlePedalPositionAdcChannel', 'Pedal', 'entrada'],
  ['oilPressure_hwChannel', 'Pressão de óleo', 'entrada'], ['lowPressureFuel_hwChannel', 'Pressão de combustível', 'entrada'],
  ['clt_adcChannel', 'Temperatura do motor', 'entrada'], ['iat_adcChannel', 'Temperatura do ar', 'entrada'],
  ['map_sensor_hwChannel', 'MAP', 'entrada'], ['baroSensor_hwChannel', 'Pressão atmosférica', 'entrada'],
  ['vehicleSpeedSensorInputPin', 'Velocidade', 'entrada'], ['flexSensorPin', 'Sensor de etanol', 'entrada'],
  ['compressorDischargeTemperature_adcChannel', 'Temperatura do intercooler', 'entrada'],
  ['tuneSwitchPin', 'Botão de troca de ajuste', 'entrada'], ['tuneSelectorChannel', 'Troca de ajuste por tensão', 'entrada'],
  ['blipButtonPin', 'Botão do blip', 'entrada'], ['ALSActivatePin', 'Botão do anti-lag', 'entrada'], ['acSwitch', 'Botão do A/C', 'entrada'],
  ['shiftLightPin', 'Shift light', 'saida'], ['wmiLevelPin', 'Boia da água/metanol', 'entrada'], ['tcSwitchPin', 'Chave do controle de tração', 'entrada'],
  ['auxSpeedSensorInputPin1', 'Roda dianteira', 'entrada'], ['auxSpeedSensorInputPin2', 'Roda traseira', 'entrada'],
];
export const PINO_NOME = Object.fromEntries(PINOS.map(([n, l]) => [n, l]));
export const PINO_TIPO = Object.fromEntries(PINOS.map(([n, , t]) => [n, t]));
