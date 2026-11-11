// Tradução dos nomes: as telas do app usam os nomes da rusEFI (RPMValue, ignitionTableTbl...).
// Quando a ECU conectada é outra (Speeduino), a ponte troca pelo equivalente dela. O que não tem
// equivalente simplesmente não existe, e a tela some do menu.

/** Canais ao vivo: nome do app -> expressão com os canais da Speeduino. */
export const SPEEDUINO_CANAIS: Record<string, string> = {
  RPMValue: 'rpm',
  TPSValue: 'tps',
  MAPValue: 'map',
  baroPressure: 'baro',
  intake: 'iat',
  VBatt: 'batteryVoltage',
  lambdaValue: 'afr / stoich',
  targetLambda: 'afrTarget / stoich',
  AFRValue: 'afr',
  detectedGear: 'gear',
  vehicleSpeedKph: 'vss',
  actualLastInjection: 'pulseWidth',
  injectorDutyCycle: 'pulseWidth * rpm / 1200', // 4 tempos: um pulso a cada 2 voltas
  ignitionAdvanceCyl1: 'advance',
  oilPressure: 'oilPressure * 6.895', // a Speeduino manda em PSI, o app trabalha em kPa
  lowFuelPressure: 'fuelPressure * 6.895',
  flexPercent: 'flex',
  ignitionLoad: 'ignLoad',
  fuelingLoad: 'fuelLoad',
  injTimeTableYAxis: 'fuelLoad',
  isCranking: 'crank',
  veValue: 'VE1',
};

/** Tabelas: nome do app -> nomes possíveis na Speeduino (o primeiro que existir no .ini). */
export const SPEEDUINO_TABELAS: Record<string, string[]> = {
  injTimeTableTbl: ['veTable1Tbl'], // a Speeduino não tem mapa em ms: o principal é o VE em %
  tune2InjTimeTbl: ['fuelTable2Tbl'], // 2º mapa de combustível da Speeduino
  ignitionTableTbl: ['sparkTbl'],
  tune2IgnitionTbl: ['spark2Tbl'],
  lambdaTableTbl: ['lambdaTable1Tbl', 'afrTable1Tbl'],
  boostTableTbl: ['boostTbl'],
  vvtTable1Tbl: ['vvtTbl'],
};

/** Variáveis do PC no .ini da Speeduino ([PcVariables]) usadas nas contas dos canais. */
export const SPEEDUINO_PC: Record<string, number> = { stoich: 14.7 };

/** Unidades que a Speeduino escolhe pela configuração (bitStringValue(lista, campo)). */
export const SPEEDUINO_LISTAS: Record<string, string[]> = {
  algorithmUnits: ['kPa', '% TPS', '%', '% TPS'],
};
