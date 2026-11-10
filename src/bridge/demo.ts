// Modo demonstração: uma ECU falsa dentro da ponte, para ver e testar as telas
// sem simulador e sem placa. A configuração começa com valores de exemplo de um
// K20 turbo e os sensores andam sozinhos (marcha lenta, acelerada, corte).
import type { ArrayField, BitsField, Ini, ScalarField } from '../core/ini.js';
import { decodeArray, decodeScalar, encodeArray, encodeBits, encodeScalar, toRaw } from '../core/codec.js';
import { TYPE_SIZE } from '../core/ini.js';

export const DEMO_SIGNATURE_NOTE = 'Modo demonstração (ECU falsa)';

const LM_INJ_TIME = 4;

/** Página 1 com valores de exemplo nos campos que as telas usam. */
export function demoPage(ini: Ini): Uint8Array {
  const size = ini.pages.find((p) => p.number === 1)?.size ?? 0;
  const page = new Uint8Array(size);
  const arr = (name: string, values: number[]) => {
    const f = ini.constants.get(name);
    if (f?.kind === 'array') encodeArray(page, f, values);
  };
  const bits = (name: string, value: number) => {
    const f = ini.constants.get(name);
    if (f?.kind === 'bits') encodeBits(page, f, value);
  };
  const rpm = [500, 800, 1200, 1600, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6800, 7600, 8400];
  const load = [20, 30, 40, 50, 60, 70, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260];
  arr('injTimeRpmBins', rpm);
  arr('injTimeLoadBins', load);
  // Pulso em ms: cresce com a carga, um pouco de torque no meio da faixa.
  const cells: number[] = [];
  for (const l of load) {
    for (const r of rpm) {
      const ve = 0.78 + 0.16 * Math.exp(-(((r - 5500) / 2600) ** 2));
      cells.push(Math.round((0.9 + (l / 100) * 5.4 * ve) * 1000) / 1000);
    }
  }
  arr('injTimeTable', cells);
  // Avanço: mais na lenta/vácuo, tira com a pressão do turbo.
  // lenta por TPS e compensação MAP/TPS (itens 61 e 62)
  arr('injTimeIdleRpmBins', Array.from({ length: 16 }, (_, i) => 600 + i * 160));
  arr('injTimeIdleTable', Array.from({ length: 16 }, (_, i) => 1.6 + i * 0.05));
  arr('injTimeLoadCompBins', Array.from({ length: 16 }, (_, i) => Math.round((100 * i) / 15)));
  arr('injTimeLoadComp', Array.from({ length: 16 }, (_, i) => (i < 3 ? -5 + i * 2.5 : 0)));
  arr('ignitionRpmBins', rpm);
  arr('ignitionLoadBins', load);
  const ign: number[] = [];
  for (const l of load) {
    for (const r of rpm) {
      const base = Math.min(38, 10 + (r / 8400) * 26);
      const v = l <= 100 ? base - (l - 20) * 0.05 : base - 4 - (l - 100) * 0.06;
      ign.push(Math.round(Math.max(8, v) * 10) / 10);
    }
  }
  arr('ignitionTable', ign);
  const sc = (name: string, v: number) => {
    const f = ini.constants.get(name);
    if (f?.kind === 'scalar') encodeScalar(page, f, v);
  };
  // Alertas de exemplo (sensor = índice da lista do .ini).
  const alerts: [number, number, number, number, number, number][] = [
    // sensor, ação, abaixo?, limite, rpm mínimo, tempo (s)
    [3, 2, 0, 105, 0, 2], // CLT acima de 105 °C: modo de segurança
    [32, 3, 1, 100, 1500, 0.5], // óleo abaixo de 100 kPa acima de 1500 RPM: desliga
    [2, 1, 0, 250, 0, 0], // MAP acima de 250 kPa: só avisa
    [43, 2, 0, 950, 3000, 1], // EGT máxima acima de 950 °C: modo de segurança
  ];
  alerts.forEach(([sensor, action, below, thr, minRpm, delay], i) => {
    const k = `alerts${i + 1}_`;
    bits(k + 'sensor', sensor);
    bits(k + 'action', action);
    bits(k + 'triggerBelow', below);
    sc(k + 'threshold', thr);
    sc(k + 'minRpm', minRpm);
    sc(k + 'delay', delay);
  });
  sc('alertSafeModeRpm', 4000);
  // VVT (VTC do K20) e lenta de exemplo
  arr('vvtTable1RpmBins', [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]);
  arr('vvtTable1LoadBins', [20, 40, 60, 80, 100, 120, 160, 200]);
  const vvt: number[] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) vvt.push(Math.round(Math.min(40, Math.max(0, 10 + r * 4 - Math.abs(c - 3) * 5))));
  arr('vvtTable1', vvt);
  sc('vvtOutputFrequency', 300); sc('vvtControlMinRpm', 1500); sc('vvtControlMinClt', 60); sc('vvtActivationDelayMs', 2000);
  sc('auxPid1_pFactor', 0.25); sc('auxPid1_iFactor', 0.05); sc('auxPid1_offset', 40); sc('auxPid1_minValue', 0); sc('auxPid1_maxValue', 90);
  sc('idlePidRpmUpperLimit', 300); sc('idlePidRpmDeadZone', 25); sc('idleRpmPid_pFactor', 0.05); sc('idleRpmPid_iFactor', 0.02); sc('idleRpmPid_minValue', -20); sc('idleRpmPid_maxValue', 20);
  sc('coastingFuelCutRpmHigh', 1800); sc('coastingFuelCutRpmLow', 1400); sc('coastingFuelCutTps', 2); sc('coastingFuelCutMap', 35); sc('coastingFuelCutClt', 60);
  sc('acDelay', 0.5); sc('maxAcClt', 110); sc('maxAcTps', 80); sc('acIdleRpmTarget', 950); sc('startUpFuelPumpDuration', 4); sc('tachPulsePerRev', 2); sc('tachPulseDuractionMs', 4); sc('startCrankingDuration', 7);
  // Sensores (K20 de exemplo)
  for (const k of ['clt', 'iat', 'compressorDischargeTemperature']) {
    [[-20, 15462], [25, 2057], [100, 186]].forEach(([t, r], i) => { sc(`${k}_tempC_${i + 1}`, t); sc(`${k}_resistance_${i + 1}`, r); });
    sc(`${k}_bias_resistor`, 2490);
  }
  sc('totalGearsCount', 6); sc('finalGearRatio', 4.76);
  [3.27, 2.13, 1.52, 1.15, 0.92, 0.74].forEach((r, i) => sc(`gearRatio${i + 1}`, r));
  sc('vssToothCount', 21); sc('vssGearRatio', 4.76); sc('driveWheelRevPerKm', 530);
  sc('oilPressure_v1', 0.5); sc('oilPressure_value1', 0); sc('oilPressure_v2', 4.5); sc('oilPressure_value2', 1000);
  sc('lowPressureFuel_v1', 0.5); sc('lowPressureFuel_value1', 0); sc('lowPressureFuel_v2', 4.5); sc('lowPressureFuel_value2', 1000);
  arr('alertRpmBins', [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]);
  arr('alerts2_curve', [50, 100, 150, 200, 250, 300, 320, 340]);
  // Motor de exemplo: Honda K20 turbo.
  sc('cylindersCount', 4); bits('firingOrder', 1); sc('displacement', 2.0); sc('rpmHardLimit', 8000); sc('cranking_rpm', 400);
  sc('injector_flow', 1000); bits('injectionMode', 1); bits('crankingInjectionMode', 0); bits('ignitionMode', 1);
  bits('trigger_type', 46); bits('vvtMode1', 10); sc('globalTriggerAngleOffset', 0); sc('fixedModeTiming', 10);
  bits('cutFuelOnHardLimit', 1); bits('cutSparkOnHardLimit', 1); sc('progressiveRevLimitWindow', 300); sc('progressiveRevLimitStartCut', 20);
  sc('launchRpm', 4500); sc('launchTimingRetard', 0); sc('fanOnTemperature', 95); sc('fanOffTemperature', 90); sc('fan2OnTemperature', 100); sc('fan2OffTemperature', 95);
  sc('tpsMin', 0.5); sc('tpsMax', 4.5); bits('triggerSensorType1', 0); bits('camSensorType1', 1); bits('camSensorType2', 1);
  bits('map_sensor_type', 3); bits('afr_type', 2);
  sc('oilPressure_v1', 0.5); sc('oilPressure_value1', 0); sc('oilPressure_v2', 4.5); sc('oilPressure_value2', 689);
  // Curvas de compensação de exemplo.
  const temps16 = [-40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110];
  arr('cltFuelCorrBins', temps16); arr('cltFuelCorr', temps16.map((t) => Math.round((1 + Math.max(0, 70 - t) * 0.012) * 100) / 100));
  arr('iatFuelCorrBins', temps16); arr('iatFuelCorr', temps16.map((t) => Math.round((1 - (t - 30) * 0.002) * 1000) / 1000));
  const temps8 = [-20, 0, 20, 40, 60, 80, 100, 120];
  arr('crankingFuelBins', temps8); arr('crankingFuelCoef', [2.8, 2.2, 1.7, 1.4, 1.2, 1.0, 1.0, 1.0]);
  arr('primeBins', temps8); arr('primeValues', [200, 150, 100, 70, 50, 35, 25, 20]);
  arr('tpsAccelCltBins', temps8); arr('tpsAccelCltMult', [2.0, 1.8, 1.5, 1.3, 1.1, 1.0, 1.0, 1.0]);
  arr('crankingAdvanceBins', [0, 200, 400, 600]); arr('crankingAdvance', [8, 10, 12, 12]);
  arr('crankingAdvanceCltBins', temps8); arr('crankingAdvanceCltAdder', [4, 3, 2, 1, 0, 0, 0, 0]);
  arr('cltIdleRpmBins', temps16); arr('cltIdleRpm', temps16.map((t) => Math.max(900, 1400 - Math.max(0, t + 40) * 5)));
  arr('cltRevLimitRpmBins', [0, 40, 60, 80]); arr('cltRevLimitRpm', [4000, 5500, 7000, 8000]);
  arr('dwellVoltageCorrVoltBins', [6, 8, 10, 11, 12, 13, 14, 15]); arr('dwellVoltageCorrValues', [2.0, 1.6, 1.3, 1.15, 1.05, 1.0, 0.95, 0.9]);
  // Tabelas pequenas e turbo.
  const rpm8 = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];
  arr('gearCompRpmBins', rpm8); arr('gearCompGearBins', [1, 2, 3, 4, 5, 6]);
  arr('gearTimingTable', Array.from({ length: 48 }, (_, i) => (Math.floor(i / 8) < 2 ? -2 : 0)));
  arr('gearFuelTable', Array.from({ length: 48 }, (_, i) => (Math.floor(i / 8) === 0 ? 3 : 0)));
  arr('postCrankingDurationBins', [0, 50, 100, 200, 400, 800]); arr('postCrankingCLTBins', [-20, 0, 20, 40, 60, 80]);
  arr('postCrankingFactor', Array.from({ length: 36 }, (_, i) => { const r = Math.floor(i / 6), c = i % 6; return Math.round((1 + Math.max(0, 5 - r) * 0.12 * Math.max(0, 1 - c / 5)) * 100) / 100; }));
  arr('boostRpmBins', rpm8); arr('boostOpenLoopLoadBins', [0, 20, 40, 50, 60, 70, 85, 100]); arr('boostClosedLoopLoadBins', [0, 20, 40, 50, 60, 70, 85, 100]);
  arr('boostTableOpenLoop', Array.from({ length: 64 }, (_, i) => { const r = Math.floor(i / 8), c = i % 8; return Math.min(80, Math.round(r * c * 1.6)); }));
  arr('boostTableClosedLoop', Array.from({ length: 64 }, (_, i) => { const r = Math.floor(i / 8), c = i % 8; return Math.round(100 + (r >= 5 ? Math.min(150, c * 25) : 0)); }));
  arr('boostShiftTimeBins', [0, 0.2, 0.4, 0.6, 0.8, 1, 1.5, 2]); arr('boostShiftGearBins', [1, 2, 3, 4, 5, 6]);
  arr('boostShiftTimeTable', Array.from({ length: 48 }, (_, i) => { const r = Math.floor(i / 8); return 120 + r * 20; }));
  bits('isBoostControlEnabled', 1); bits('boostType', 1); sc('boostPwmFrequency', 33); sc('boostControlMinRpm', 2500); sc('boostControlMinTps', 30); sc('boostControlMinMap', 100); sc('boostCutPressure', 300);
  bits('fuelClosedLoopCorrectionEnabled', 1); sc('stft_minRpm', 1200); sc('stft_maxRpm', 7000); sc('stft_startupDelay', 30); sc('stft_shiftPauseTime', 0.5);
  sc('stft_cellCfgs3_maxAdd', 10); sc('stft_cellCfgs3_maxRemove', 10); sc('stft_deadband', 0.5);
  sc('coldStartInjectorMaxClt', 15); sc('coldStartInjectorAfterStart', 3); sc('coldStartInjectorPeriod', 200); sc('floodClearTps', 90); sc('oilPressureStartTimeout', 5); sc('oilRestartLockTime', 30);
  sc('knockRetardAggression', 2); sc('knockRetardReapplyRate', 0.5); sc('knockFrequency', 6800);
  bits('etbAutoRecoverEnabled', 1); sc('etbAutoRecoverDelay', 1); sc('etbAutoRecoverMaxTries', 3); sc('blipThrottleAdd', 20); sc('blipDuration', 150); sc('blipMinRpm', 2500);
  // v0.28: shift light, água/metanol e controle de tração.
  [7200, 6800, 7400, 7600, 7600, 7600, 7600].forEach((r, i) => sc(`shiftLightRpm${i + 1}`, r)); sc('shiftLightPreRpm', 1500);
  sc('wmiGppwmChannel', 8); sc('gppwm8_pwmFrequency', 30); sc('wmiActiveDuty', 10); sc('wmiLevelDelay', 2); sc('wmiTimingAdd', 3); sc('wmiFuelTrim', -5);
  bits('tcWheelSource', 2); sc('tcMinSpeed', 10);
  // anti-lag (referência cap. 19.30): exemplo de turbo, desligado
  sc('ALSMaxTPS', 5); sc('ALSMinRPM', 2500); sc('ALSMaxRPM', 7000); sc('ALSMinCLT', 60); sc('ALSMaxCLT', 105); sc('ALSMaxDuration', 5);
  sc('ALSIdleAdd', 20); sc('ALSEtbAdd', 15);
  for (const t of ['alsIgnRetardrpmBins', 'alsFuelAdjustmentrpmBins', 'alsIgnSkiprpmBins']) arr(t, [2500, 4000, 5500, 7000]);
  for (const t of ['alsIgnRetardLoadBins', 'alsFuelAdjustmentLoadBins', 'alsIgnSkipLoadBins']) arr(t, [0, 2, 5, 10]);
  arr('ALSTimingRetardTable', Array.from({ length: 16 }, (_, i) => -20 + Math.floor(i / 4) * 4));
  arr('ALSFuelAdjustment', Array.from({ length: 16 }, (_, i) => 15 - Math.floor(i / 4) * 3));
  arr('ALSIgnSkipTable', Array.from({ length: 16 }, () => 0));
  bits('ftcanRealtimeData', 1); sc('sdLogStartRpm', 500); sc('sdLogStopRpm', 300); sc('sdLogStopDelay', 10); sc('sdLogKeepFreeMb', 200); bits('sdLogSaveTune', 1);
  bits('launchBoostOverride', 1); sc('launchBoostDuty', 30); sc('launchBoostTarget', 150); sc('antilagBoostDuty', 40); sc('antilagBoostTarget', 170);
  sc('boostRestPosition', 0); sc('domeTargetOffset', 0); sc('domeControlBand', 5); sc('domeMaxPressure', 400);
  // Funções que ganharam tela na v0.11.
  arr('lambdaRpmBins', rpm); arr('lambdaLoadBins', load);
  arr('lambdaTable', load.flatMap((l) => rpm.map(() => (l <= 100 ? 1.0 : l <= 140 ? 0.88 : 0.8))));
  arr('injector_battLagCorrBattBins', [6, 8, 10, 11, 12, 13, 14, 15]); arr('injector_battLagCorrPressBins', [300, 400]);
  arr('injector_battLagCorrTable', [3.2, 2.2, 1.6, 1.35, 1.15, 1.0, 0.9, 0.82, 3.4, 2.35, 1.7, 1.45, 1.22, 1.06, 0.95, 0.86]);
  arr('etbSpeedCltBins', [-20, 0, 20, 40, 60, 70, 80, 90]); arr('etbOpenSpeed', [150, 200, 300, 400, 600, 800, 0, 0]); arr('etbCloseSpeed', [150, 200, 300, 400, 600, 800, 0, 0]);
  sc('etbMaximumPosition', 100); sc('throttlePedalUpVoltage', 0.75); sc('throttlePedalWOTVoltage', 4.2); sc('throttlePedalSecondaryUpVoltage', 0.37); sc('throttlePedalSecondaryWOTVoltage', 2.1);
  arr('coldStartInjectorCltBins', [-30, -20, -10, 0, 5, 10, 15, 20]); arr('coldStartInjectorPulse', [40, 30, 22, 15, 10, 6, 3, 0]);
  arr('stftLimitMapBins', [30, 60, 100, 140, 180, 220, 260, 300]); arr('stftLimitMaxAdd', [15, 15, 12, 10, 8, 6, 5, 5]); arr('stftLimitMaxRemove', [15, 15, 12, 10, 8, 6, 5, 5]);
  sc('cylLambdaTrimMax', 5); sc('cylLambdaTrimGain', 1);
  arr('alertBoostEthanolBins', [0, 15, 25, 40, 55, 70, 85, 100]); arr('alertBoostEthanolLimit', [180, 190, 200, 230, 260, 290, 320, 340]);
  arr('idleAdvanceBins', [600, 700, 800, 900, 1000, 1100, 1200, 1400]); arr('idleAdvance', [20, 18, 16, 14, 12, 11, 10, 10]);
  const volts8 = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.5];
  arr('oilPressureCurve_voltage', volts8); arr('oilPressureCurve_value', volts8.map((v) => Math.round((v - 0.5) * 172)));
  arr('lowPressureFuelCurve_voltage', volts8); arr('lowPressureFuelCurve_value', volts8.map((v) => Math.round((v - 0.5) * 172)));
  arr('shiftCompTimeBins', [0, 0.1, 0.2, 0.3, 0.5, 0.7, 1, 1.5]); arr('shiftCompGearBins', [1, 2, 3, 4, 5, 6]);
  arr('shiftTimingRetardTable', Array.from({ length: 48 }, (_, i) => Math.max(0, 6 - (i % 8) * 1.5)));
  arr('shiftFuelTable', Array.from({ length: 48 }, (_, i) => Math.max(0, 8 - (i % 8) * 2)));
  sc('shiftCompMinTps', 50);
  // Injeção rápida, ajuste por cilindro, avanço por temperatura, limites de ponto
  const tps8 = [0, 10, 20, 35, 50, 65, 80, 100];
  arr('tpsTpsAccelFromRpmBins', tps8); arr('tpsTpsAccelToRpmBins', tps8);
  arr('tpsTpsAccelTable', Array.from({ length: 64 }, (_, i) => { const to = Math.floor(i / 8), from = i % 8; return Math.max(0, (tps8[to] - tps8[from]) / 25); }));
  sc('tpsAccelEnrichmentThreshold', 4); sc('tpsAccelFractionPeriod', 3); sc('tpsAccelFractionDivisor', 1.5);
  sc('tpsDecelEnleanmentThreshold', 7); sc('tpsDecelEnleanmentMultiplier', 0.7);
  arr('fuelTrimRpmBins', [1000, 3000, 5000, 7000]); arr('fuelTrimLoadBins', [30, 80, 130, 200]);
  arr('ignTrimRpmBins', [1000, 3000, 5000, 7000]); arr('ignTrimLoadBins', [30, 80, 130, 200]);
  arr('fuelTrims4_table', Array.from({ length: 16 }, (_, i) => (i >= 8 ? 2 : 0)));
  arr('ignTrims4_table', Array.from({ length: 16 }, (_, i) => (i >= 8 ? -1 : 0)));
  arr('ignitionCltCorrTempBins', [-20, 0, 40, 80, 110]); arr('ignitionCltCorrLoadBins', [30, 60, 100, 150, 250]);
  arr('ignitionCltCorrTable', [5, 5, 4, 3, 2, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -2, -3, -4, -5]);
  arr('ignitionIatCorrTempBins', [-20, 0, 20, 40, 50, 60, 70, 80]); arr('ignitionIatCorrLoadBins', [30, 60, 100, 130, 160, 190, 220, 250]);
  arr('ignitionIatCorrTable', Array.from({ length: 64 }, (_, i) => { const t = i % 8, l = Math.floor(i / 8); return t <= 3 ? 0 : -(t - 3) * (l / 4 + 0.5); }));
  sc('minimumIgnitionTiming', -15); sc('maximumIgnitionTiming', 45);
  sc('idleAfterStartRpmAdd', 300); sc('idleAfterStartRpmTime', 20); sc('idleLoadTimingStep', 3); sc('idleLoadTimingStepTime', 2); sc('idleTimingExitRampTime', 1);
  sc('acExtraFuel', 2); sc('fan1ExtraFuel', 1); sc('fan2ExtraFuel', 1);
  sc('vvlController_activationRpm', 5200); sc('vvlController_deactivationRpm', 4900); sc('vvlController_minimumClt', 60); sc('vvlController_minimumTps', 30); sc('vvlController_minimumOilPressure', 250);
  sc('trigger_customTotalToothCount', 60); sc('trigger_customSkippedToothCount', 2);
  sc('camSyncWindowStart1', 340); sc('camSyncWindowWidth1', 20); sc('camSyncToothCount1', 5);
  for (let g = 1; g <= 8; g++) {
    arr(`gppwm${g}_rpmBins`, rpm8); arr(`gppwm${g}_loadBins`, [0, 20, 40, 60, 80, 100, 120, 140]);
    sc(`gppwm${g}_pwmFrequency`, g === 1 ? 0 : 100); sc(`gppwm${g}_onAboveDuty`, 50); sc(`gppwm${g}_offBelowDuty`, 40);
  }
  bits('gppwm1_loadAxis', 3); bits('gppwm1_rpmAxis', 24);
  arr('gppwm1_table', Array.from({ length: 64 }, (_, i) => (Math.floor(i / 8) >= 5 ? 100 : 0))); // ventoinha extra com motor quente
  sc('customCanFrames1_canId', 0x400); bits('customCanFrames1_mode', 1); sc('customCanFrames1_periodMs', 50);
  bits('customCanFrames1_values1_source', 24); sc('customCanFrames1_values1_scale', 1); bits('customCanFrames1_values2_source', 3); sc('customCanFrames1_values2_scale', 10);
  // Pinos de exemplo nos fios da placa (src/core/placa.ts): bicos Azul 1-4, bobinas Cinza 1-4, auxiliares nos amarelos.
  const pin = (name: string, pino: string) => { const f = ini.constants.get(name); if (f?.kind === 'bits') { const i = f.options.indexOf(pino); if (i > 0) encodeBits(page, f, i); } };
  [1, 2, 3, 4].forEach((n) => { pin(`injectionPins${n}`, `PD${7 + n}`); pin(`ignitionPins${n}`, `PE${7 + n}`); });
  pin('fuelPumpPin', 'PG0'); pin('fanPin', 'PG1'); pin('boostControlPin', 'PG2'); pin('mainRelayPin', 'PG3'); pin('tuneSwitchPin', 'PA4');
  for (let i = 1; i <= 12; i++) sc(`customFiringOrder${i}`, i);
  bits('isInjectionEnabled', 1); bits('isIgnitionEnabled', 1); bits('injectionTimingMode', 0); sc('crankingTimingAngle', 10);
  arr('sparkDwellRpmBins', rpm8); arr('sparkDwellValues', [3.5, 3.2, 3.0, 3.0, 3.0, 2.8, 2.6, 2.5]);
  arr('injPhaseRpmBins', [800, 2000, 3500, 5000, 6500, 8000]); arr('injPhaseLoadBins', [30, 60, 100, 150, 200, 250]);
  arr('injectionPhase', Array.from({ length: 36 }, (_, i) => -360 - (i % 6) * 20));
  sc('tuneCount', 1);
  sc('activeTune', 1);
  bits('fuelAlgorithm', LM_INJ_TIME);
  bits('injTimeUseTps', 0);
  return page;
}

function writeScalar(buf: Uint8Array, f: ScalarField | BitsField, v: number) {
  if (f.kind === 'bits') { encodeBits(buf, f, v); return; }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const raw = f.type === 'F32' ? toRaw(v, f) : Math.round(toRaw(v, f));
  const c = (lo: number, hi: number) => Math.min(hi, Math.max(lo, raw));
  switch (f.type) {
    case 'U08': dv.setUint8(f.offset, c(0, 0xff)); break;
    case 'S08': dv.setInt8(f.offset, c(-0x80, 0x7f)); break;
    case 'U16': dv.setUint16(f.offset, c(0, 0xffff), true); break;
    case 'S16': dv.setInt16(f.offset, c(-0x8000, 0x7fff), true); break;
    case 'U32': dv.setUint32(f.offset, c(0, 0xffffffff), true); break;
    case 'S32': dv.setInt32(f.offset, c(-0x80000000, 0x7fffffff), true); break;
    case 'F32': dv.setFloat32(f.offset, raw, true); break;
  }
}

/** Interpolação na tabela 16×16 (linha = carga, coluna = RPM). */
function lookup(xs: number[], ys: number[], z: number[], x: number, y: number) {
  const idx = (bins: number[], v: number) => {
    let i = 0;
    while (i < bins.length - 2 && v > bins[i + 1]) i++;
    const t = Math.min(1, Math.max(0, (v - bins[i]) / (bins[i + 1] - bins[i] || 1)));
    return [i, t] as const;
  };
  const [c, tx] = idx(xs, x);
  const [r, ty] = idx(ys, y);
  const n = xs.length;
  const a = z[r * n + c], b = z[r * n + c + 1], d = z[(r + 1) * n + c], e = z[(r + 1) * n + c + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
}

/** Motor falso: um ciclo de ~24 s com lenta, acelerações, puxada e corte. */
export class DemoEngine {
  private t0 = Date.now();
  private clt = 35;
  private rpm = 900;
  private latched = 0;
  // Senhas: imita o firmware (3 erros = 30 s bloqueado).
  private entered = [false, false, false, false];
  private pwResult = 0;
  private fails = 0;
  private lockUntil = 0;
  password(idx: number, page: Uint8Array) {
    const get = (n: string) => { const f = this.ini.constants.get(n); return f?.kind === 'scalar' ? decodeScalar(page, f) : 0; };
    const put = (n: string, v: number) => { const f = this.ini.constants.get(n); if (f?.kind === 'scalar') encodeScalar(page, f, v); };
    const names = ['', 'ecuPasswords_userPin', 'ecuPasswords_tunerPin', 'ecuPasswords_maintenancePin'];
    const entry = get('ecuPasswords_pinEntry'), newPin = get('ecuPasswords_pinNew'), locks = get('ecuPasswords_newUserLocks');
    if (Date.now() < this.lockUntil && idx !== 0x34) { this.pwResult = 3; return; }
    const check = (lvl: number) => {
      const pin = get(names[lvl]);
      if (!pin || entry === pin) { this.fails = 0; return true; }
      if (++this.fails >= 3) { this.lockUntil = Date.now() + 30000; this.fails = 0; this.pwResult = 3; } else this.pwResult = 2;
      return false;
    };
    if (idx >= 0x2e && idx <= 0x30) { const l = idx - 0x2d; if (check(l)) { this.entered[l] = true; this.pwResult = 1; } }
    else if (idx >= 0x31 && idx <= 0x33) {
      const l = idx - 0x30;
      const tunerReleases = l !== 2 && get(names[2]) && this.entered[2];
      if (get(names[l]) && !tunerReleases && !check(l)) return;
      put(names[l], newPin); this.entered[l] = newPin !== 0; this.pwResult = 1;
      if (l === 1) put('ecuPasswords_userLocks', locks & 7);
    } else if (idx === 0x34) { this.entered = [false, false, false, false]; this.pwResult = 1; }
  }

  constructor(private ini: Ini) {}

  // Odômetro parcial (zera pelo botão do Diagnóstico) e correção de longo prazo (LTFT).
  private partial = 312400;
  /** Página 3 da ECU falsa: LTFT aprendida (um pouco rica em baixo, pobre no turbo). */
  ltftPage(size: number) {
    const p = new Uint8Array(size);
    const f = this.ini.constants.get('ltft_table_bank1');
    if (f?.kind === 'array') encodeArray(p, f, Array.from({ length: f.rows * f.cols }, (_, i) => {
      const r = Math.floor(i / f.cols), c = i % f.cols;
      return r < 3 || c < 1 ? 0 : Math.round((r > 9 ? 2.5 + (c % 3) : -1.5 + ((r + c) % 4) * 0.6) * 10) / 10;
    }));
    return p;
  }
  /** Botões de ação. Devolve true quando mudou a configuração (fica para gravar). */
  command(name: string, page: Uint8Array, ltft?: Uint8Array) {
    if (name === 'cmd_odometer_reset_partial') this.partial = 0;
    const lf = this.ini.constants.get('ltft_table_bank1');
    if (!ltft || lf?.kind !== 'array') return false;
    if (name === 'cmd_ltft_apply_to_ve') {
      const zf = this.ini.constants.get('injTimeTable') as ArrayField;
      const z = decodeArray(page, zf), t = decodeArray(ltft, lf);
      encodeArray(page, zf, z.map((v, i) => Math.round(v * (1 + (t[i] ?? 0) / 100) * 1000) / 1000));
    }
    if (name === 'cmd_ltft_apply_to_ve' || name === 'cmd_ltft_reset') encodeArray(ltft, lf, new Array(lf.rows * lf.cols).fill(0));
    return name === 'cmd_ltft_apply_to_ve';
  }

  step(page: Uint8Array, out: Uint8Array) {
    const t = ((Date.now() - this.t0) / 1000) % 24;
    // Borboleta: lenta, blips, puxada longa até o corte.
    let tps = 0;
    if (t > 3 && t < 4.2) tps = 35;
    else if (t > 7 && t < 8) tps = 60;
    else if (t > 11 && t < 18) tps = 100;
    const targetRpm = tps === 0 ? 900 : tps < 50 ? 3200 : tps < 80 ? 4800 : 7900;
    const rate = targetRpm > this.rpm ? (tps > 80 ? 0.035 : 0.12) : 0.06;
    this.rpm += (targetRpm - this.rpm) * rate + (Math.random() - 0.5) * 18;
    const rpm = Math.max(0, this.rpm);
    const boostKpa = tps > 80 ? Math.min(180, Math.max(0, (rpm - 3500) / 25)) : 0;
    const map = tps === 0 ? 34 + Math.random() * 2 : Math.min(101, 40 + tps * 0.6) + boostKpa;
    this.clt = Math.min(88, this.clt + 0.015);

    const xs = decodeArray(page, this.ini.constants.get('injTimeRpmBins') as ArrayField);
    const ys = decodeArray(page, this.ini.constants.get('injTimeLoadBins') as ArrayField);
    const z = decodeArray(page, this.ini.constants.get('injTimeTable') as ArrayField);
    const inj = lookup(xs, ys, z, rpm, map);
    const target = map > 110 ? 0.82 : tps > 0 ? 0.92 : 1.0;
    const lambda = target + (Math.random() - 0.5) * 0.03;

    const set = (name: string, v: number) => {
      const f = this.ini.outputs.get(name);
      if (f && f.offset + TYPE_SIZE[f.type] <= out.length) writeScalar(out, f, v);
    };
    set('RPMValue', rpm);
    set('TPSValue', tps);
    set('MAPValue', map);
    set('baroPressure', 101.3);
    set('coolant', this.clt);
    set('intake', 28 + boostKpa / 20);
    set('lambdaValue', lambda);
    set('targetLambda', target);
    set('actualLastInjection', inj);
    set('injectorDutyCycle', Math.min(100, (inj * rpm) / 1200));
    const ixs = decodeArray(page, this.ini.constants.get('ignitionRpmBins') as ArrayField);
    const iys = decodeArray(page, this.ini.constants.get('ignitionLoadBins') as ArrayField);
    const iz = decodeArray(page, this.ini.constants.get('ignitionTable') as ArrayField);
    set('ignitionAdvanceCyl1', lookup(ixs, iys, iz, rpm, map));
    set('ignitionLoad', map);
    set('oilPressure', 100 + rpm / 20);
    set('lowFuelPressure', 300 + boostKpa);
    set('rawTps1Primary', 0.52 + tps * 0.0397);
    set('rawMap', 0.4 + map * 0.0155);
    set('rawClt', 3.9 - this.clt * 0.032);
    set('rawIat', 2.6);
    set('rawLowFuelPressure', 0.5 + (300 + boostKpa) / 1000 * 4);
    set('rawOilPressure', 0.5 + (100 + rpm / 20) / 689 * 4);
    set('internalMcuTemperature', 41);
    set('seconds', (Date.now() - this.t0) / 1000);
    set('engineRunTime', (Date.now() - this.t0) / 1000);
    set('totalTriggerErrorCounter', 0);
    set('sd_present', 1);
    {
      const g = (n: string) => { const f = this.ini.constants.get(n); return f?.kind === 'scalar' ? decodeScalar(page, f) : 0; };
      const u = g('ecuPasswords_userPin'), tu = g('ecuPasswords_tunerPin'), m = g('ecuPasswords_maintenancePin'), lk = g('ecuPasswords_userLocks');
      const userLocked = u && !this.entered[1];
      set('pinStatus', (u ? 1 : 0) | (tu ? 2 : 0) | (m ? 4 : 0) | (userLocked && lk & 4 ? 8 : 0) | (userLocked && lk & 1 ? 16 : 0) | (userLocked && lk & 2 ? 32 : 0)
        | (tu && !this.entered[2] ? 64 : 0) | (m && !this.entered[3] ? 128 : 0));
      set('pinLastResult', this.pwResult);
      set('pinLockoutLeft', Math.max(0, Math.ceil((this.lockUntil - Date.now()) / 1000)));
    }
    set('odometerTotal', 15234000); set('odometerPartial', this.partial); set('hourMeterTotal', 412 * 3600 + (Date.now() - this.t0) / 1000);
    set('detectedGear', tps > 80 ? 3 : tps > 0 ? 2 : 0);
    set('vehicleSpeedKph', tps > 80 ? rpm * 0.0187 : tps > 0 ? rpm * 0.013 : 0);
    // shift light: RPM de troca da marcha atual (igual ao firmware: marcha em 0 usa a primeira)
    {
      const gear = tps > 80 ? 3 : tps > 0 ? 2 : 0;
      const g = (n: string) => { const f = this.ini.constants.get(n); return f?.kind === 'scalar' ? decodeScalar(page, f) : 0; };
      const target = g(`shiftLightRpm${gear >= 1 && gear <= 6 ? gear + 1 : 1}`) || g('shiftLightRpm1');
      const pre = g('shiftLightPreRpm');
      const on = target > 0 && rpm >= target;
      set('shiftLightTarget', target); set('shiftLightOn', on ? 1 : 0);
      set('shiftLightProgress', on ? 100 : pre > 0 && target > 0 ? Math.max(0, Math.min(99, ((rpm - (target - pre)) * 100) / pre)) : 0);
      // água/metanol: injeta com pressão positiva
      const wmi = g('wmiGppwmChannel') ? Math.min(100, Math.max(0, (map - 130) * 0.8)) : 0;
      set('wmiDuty', wmi); set('wmiStatus', g('wmiGppwmChannel') ? (wmi > g('wmiActiveDuty') ? 2 : 1) : 0);
      // rodas: a traseira patina um pouco no começo da puxada
      const speed = tps > 80 ? rpm * 0.0187 : tps > 0 ? rpm * 0.013 : 0;
      const slip = g('tcWheelSource') && tps > 80 && rpm < 6000 ? 0.12 : 0.01;
      set('wheelSpeedFront', speed); set('wheelSpeedRear', speed * (1 + slip)); set('wheelSlip', speed > 10 ? slip * 100 : 0);
      set('wheelSlipRatio', speed > 10 ? 1 + slip : 1);
    }
    set('ltftCorrection1', map > 110 ? 2.4 : -0.8); set('ltftLearning', this.clt > 70 ? 1 : 0);
    set('rawPpsPrimary', 0.75 + tps * 0.0345); set('rawPpsSecondary', 0.37 + tps * 0.0173); set('throttlePedalPosition', tps);
    set('VBatt', 13.9 + (Math.random() - 0.5) * 0.1);
    set('running_baseFuel', inj * 6);
    // Alerta 3 (MAP acima de 250 kPa) acende de verdade na puxada.
    const on = map > 250;
    if (on) this.latched |= 4;
    set('alertActiveMask', on ? 4 : 0);
    // Ajuste em uso: o escolhido, se o mapa dele não estiver vazio (igual ao firmware).
    const at = this.ini.constants.get('activeTune');
    const want = at?.kind === 'scalar' ? decodeScalar(page, at) : 1;
    const tz = want > 1 ? this.ini.constants.get(`extraTunes${want - 1}_injTimeTable`) : undefined;
    const empty = tz?.kind === 'array' && decodeArray(page, tz).every((v) => v === 0);
    set('tuneInUse', empty ? 1 : want);
    set('alertLatchedMask', this.latched);
    set('alertLevel', on ? 1 : 0);
  }
}

/** Para testes: lê um canal do buffer de saídas. */
export function readOut(ini: Ini, out: Uint8Array, name: string) {
  const f = ini.outputs.get(name);
  return f && f.kind === 'scalar' ? decodeScalar(out, f) : undefined;
}
