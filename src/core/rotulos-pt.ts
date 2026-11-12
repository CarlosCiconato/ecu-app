// Tradução para português dos textos que vêm do .ini (Speeduino: rótulos dos campos, títulos de telas,
// menus, curvas, tabelas e opções). O .ini só tem inglês, igual ao TunerStudio.
// A chave ignora maiúsculas, '&' (atalho de teclado do TunerStudio), '!'/'#' do início, ':' do fim
// e números: "AUX Input 7" usa a linha "AUX Input 0  ->  Entrada auxiliar #", e cada # recebe o número
// do original, na ordem. Texto que não está no dicionário fica como veio.

/** Chave de busca: sem &, !/#/aspas do começo, ':' do fim, números viram #, minúsculas. */
export function chaveRotulo(s: string): string {
  return s.replace(/&/g, '').replace(/^[!#"\s]+/, '').replace(/"\s+\w+$/, '').replace(/"$/, '')
    .replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').replace(/[:\s]+$/, '').trim().toLowerCase();
}

function monta(texto: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of texto.split('\n')) {
    const [en, pt] = l.split('\t');
    if (en && pt) m.set(chaveRotulo(en), pt);
  }
  return m;
}

let rotulos: Map<string, string> | undefined;
let opcoes: Map<string, string> | undefined;

function aplica(s: string, m: Map<string, string>): string {
  const pt = m.get(chaveRotulo(s));
  if (!pt) return s;
  const nums = s.match(/\d+(\.\d+)?/g) ?? [];
  const vagas = pt.split('#').length - 1;
  if (!vagas || vagas !== nums.length) return pt;
  let i = 0;
  return pt.replace(/#/g, () => nums[i++].replace('.', ','));
}

/** Rótulo, título de tela, menu, curva ou tabela em português (ou o original). */
export function ptRotulo(s: string | undefined): string {
  if (!s) return s ?? '';
  rotulos ??= monta(ROTULOS);
  return aplica(s, rotulos);
}

/** Opção de lista (Sim/Não, Ligado, Sequencial...) em português (ou a original). */
export function ptOpcao(s: string): string {
  if (!s) return s;
  opcoes ??= monta(OPCOES);
  return opcoes.has(chaveRotulo(s)) ? aplica(s, opcoes) : s;
}

export const ROTULOS = `
Reload project to update gauges	Reabra o projeto para atualizar os mostradores
Soft limiter only available with ignition cut	Limitador suave só funciona com corte de ignição
The below options are for compatibility and legacy use only.	As opções abaixo são para compatibilidade e uso antigo.
This is a critical setting!	Este é um ajuste crítico!
VVT PWM is shared with WMI. The 2 cannot be used at the same time.	O PWM do VVT é compartilhado com o WMI. Os # não podem ser usados ao mesmo tempo.
VVT2 PWM is shared with WMI. The 2 cannot be used at the same time.	O PWM do VVT# é compartilhado com o WMI. Os # não podem ser usados ao mesmo tempo.
VVT2 PWM is shared with WMI. VVT2 cannot be used while WMI is enabled.	O PWM do VVT# é compartilhado com o WMI. O VVT# não pode ser usado com o WMI ligado.
WARNING! USE AT YOUR OWN RISK. INCORRECT USE WILL DAMAGE YOUR HARDWARE!	ATENÇÃO! USE POR SUA CONTA E RISCO. O USO ERRADO VAI DANIFICAR O SEU HARDWARE!
WMI PWM frequency is the same as VVT. The 2 cannot be set independently.	A frequência do PWM do WMI é a mesma do VVT. As # não podem ser ajustadas separadas.
WMI PWM frequency is the same as VVT2. WMI PWM cannot be used while VVT2 is enabled.	A frequência do PWM do WMI é a mesma do VVT#. O PWM do WMI não pode ser usado com o VVT# ligado.
WMI PWM is shared with VVT. The 2 cannot be used at the same time.	O PWM do WMI é compartilhado com o VVT. Os # não podem ser usados ao mesmo tempo.
WMI PWM is shared with VVT2. The 2 cannot be used at the same time.	O PWM do WMI é compartilhado com o VVT#. Os # não podem ser usados ao mesmo tempo.
Warning: Clicking the below button will erase all data from SD card	Atenção: o botão abaixo apaga todos os dados do cartão SD
Warning: The board you have selected may not have enough channels for sequential fuel!	Atenção: a placa escolhida pode não ter canais suficientes para injeção sequencial!
Warning: The board you have selected may not have enough channels for sequential ignition!	Atenção: a placa escolhida pode não ter canais suficientes para ignição sequencial!
Level for 1st phase	Nível para a #ª fase
Missing Tooth Secondary type	Tipo do sinal secundário (dente faltante)
BATTERY VOLTAGE INDICATOR	INDICADOR DE TENSÃO DA BATERIA
Baro Sensor	Sensor de pressão atmosférica
Detection	Detecção
EMAP Sensor	Sensor EMAP
Experimental!	Experimental!
Fast Idle	Marcha lenta acelerada
MAP	MAP
MAP Sensor	Sensor MAP
Most setups will NOT require changes to the default filter values	A maioria dos motores NÃO precisa mudar os filtros padrão
NOTE Realtime Data Base Address MUST be at least 0x16 GREATER than the True Address as they are reserved for future expansion	NOTA: o endereço base dos dados em tempo real PRECISA ser pelo menos 0x16 MAIOR que o endereço real (reservado para expansão)
NOTE: When the TunerStudio protocol is selected, the primary and secondary serial connections cannot be used simultaneously	NOTA: com o protocolo TunerStudio, as seriais primária e secundária não podem ser usadas ao mesmo tempo
Note	Nota
Note: Closed loop is currently experimental and available on Miata and missing tooth patterns ONLY	Nota: malha fechada é experimental e só funciona nos padrões Miata e dente faltante
Note: During cranking the fixed/locked timing angle is overridden by the Cranking advance angle value above	Nota: na partida o ângulo fixo é substituído pelo avanço de partida acima
Note: During cranking the fixed/locked timing angle is overriden by the Cranking advance angle value above	Nota: na partida o ângulo fixo é substituído pelo avanço de partida acima
Note: This function requires wideband sensor and proper AFR table	Nota: esta função precisa de sonda wideband e tabela de AFR correta
Please ensure you calibrate your O2 sensor in the Tools menu	Calibre a sonda lambda no menu Ferramentas
Please note that close loop is currently experimental for Miata patterns ONLY	Nota: malha fechada é experimental e só funciona nos padrões Miata
Please note that closed loop is currently experimental for Miata and missing tooth patterns ONLY	Nota: malha fechada é experimental e só funciona nos padrões Miata e dente faltante
RPM	RPM
Recovery	Recuperação
Retard	Atraso
Set 0.0 to disable the delay	Use 0,0 para desligar o atraso
Set 0.0 to disable the limit	Use 0,0 para desligar o limite
Spark/Fuel	Ignição/Combustível
The below option is EXPERIMENTAL! If unsure what this is, please set to No	A opção abaixo é EXPERIMENTAL! Se não souber o que é, deixe em Não
The below option is currently in testing! If unsure what this is, please set to No	A opção abaixo está em teste! Se não souber o que é, deixe em Não
Time and duration curves share common coolant values	As curvas de tempo e duração usam os mesmos valores de temperatura do motor
Timing Recovery	Recuperação do ponto
Acceleration Enrichment	Enriquecimento na aceleração
IAT Retard	Atraso por temperatura do ar
Realtime Display	Painel em tempo real
Spark Settings	Ajustes de ignição
Spark Table	Mapa de ignição
Trigger Setup	Ajuste da roda fônica
VE Table	Mapa de VE
Warmup Enrichment	Enriquecimento de aquecimento
2nd Condition	#ª condição
3D Tuning Maps	Mapas #D
50% DC	#% de duty
60km/h auto-calibrate	Autocalibrar a #km/h
AFR Table	Mapa de AFR
A/C Comp. On Delay (During Operation)	Atraso do compressor do A/C (em funcionamento)
A/C Comp. Output Polarity	Polaridade da saída do compressor do A/C
A/C Compressor Output Pin	Pino de saída do compressor do A/C
A/C Initial Delay After Cranking	Atraso inicial do A/C depois da partida
A/C Request Input Pin	Pino de entrada do pedido do A/C
A/C Request Input Polarity	Polaridade da entrada do pedido do A/C
AFR Protection	Proteção por AFR
AFR Target Table	Mapa de AFR alvo
AFR protection is used to prevent engine from running lean	A proteção por AFR evita que o motor trabalhe pobre
AFR/O2	AFR/Sonda
ASE - Duration	Pós-partida - Duração
ASE - Enrichment %	Pós-partida - Enriquecimento %
AUX Input 0	Entrada auxiliar #
Accel Time	Tempo de aceleração
Acceleration Enrichment cold adjustment	Ajuste a frio do enriquecimento na aceleração
Accessories	Acessórios
Activate after	Ativar depois de
Activation Delay	Atraso para ativar
Active Above Coolant	Ativo acima da temperatura do motor
Active Above Load	Ativo acima da carga
Active Above MAP	Ativo acima do MAP
Active Above RPM	Ativo acima do RPM
Active Below Load	Ativo abaixo da carga
Active Below MAP	Ativo abaixo do MAP
Active Below RPM	Ativo abaixo do RPM
Active Below TPS	Ativo abaixo do TPS
Active Below VSS	Ativo abaixo da velocidade
Add cold advance	Somar avanço a frio
Added	Somado
Additional advance	Avanço adicional
Additional boost	Pressão de turbo adicional
Additional step size	Tamanho do passo adicional
Adjust fuel timing	Ajustar fase da injeção
Advance	Avanço
After setting 'Pulses per km/mile' above	Depois de ajustar 'Pulsos por km/milha' acima
Afterstart Enrichment	Enriquecimento pós-partida
Afterstart Enrichment (ASE)	Enriquecimento pós-partida
Afterstart Enrichment(ASE)	Enriquecimento pós-partida
Air Conditioning	Ar-condicionado
Air Conditioning Control	Controle do ar-condicionado
Air Conditioning Enable	Ligar ar-condicionado
Air Temperature	Temperatura do ar
Algorithm	Algoritmo
Allow fan when cranking	Permitir ventoinha na partida
Allow fan when off	Permitir ventoinha com motor desligado
Analog pin to use	Pino analógico usado
Analog pin to use for ext. Baro sensor	Pino analógico do sensor de pressão atmosférica externo
Analog sensor filters	Filtros dos sensores analógicos
Arming Pin	Pino de armar
Aux Input Channel Enable	Ligar canal de entrada auxiliar
Auxiliary Input Configuration	Configuração das entradas auxiliares
Auxillary Input Configuration	Configuração das entradas auxiliares
BMW Instrument Cluster Broadcast	Envio para o painel de instrumentos BMW
Baro Pressure	Pressão atmosférica
Baro fuel correction	Correção de combustível pela pressão atmosférica
Barometric Correction	Correção pela pressão atmosférica
Base Injector Open Time	Tempo de abertura base do bico
Base duty cycle to be used for a given boost target	Duty base para cada alvo de pressão de turbo
Base duty for closed loop	Duty base para malha fechada
Battery Voltage Correction Mode	Modo de correção pela tensão da bateria
Battery Voltage reading offset	Ajuste da leitura da tensão da bateria
Battery voltage	Tensão da bateria
Board Layout	Modelo da placa
Board pin	Pino da placa
Boost	Turbo
Boost Control	Controle de pressão de turbo
Boost Control Enabled	Controle de pressão ligado
Boost Cut	Corte por pressão de turbo
Boost Duty / Target	Pressão de turbo: duty / alvo
Boost Limit	Limite de pressão de turbo
Boost Targets/Duty	Pressão de turbo: alvos/duty
Boost Targets/Load	Pressão de turbo: alvos/carga
Boost by Gear	Pressão de turbo por marcha
Boost control enable threshold	Limite para ligar o controle de pressão
Boost control enable trigger	Gatilho para ligar o controle de pressão
Boost control type	Tipo de controle de pressão
Boost output pin	Pino de saída do controle de pressão
Boost solenoid freq.	Frequência da válvula de pressão
Boost target	Alvo de pressão de turbo
Boost targets (Absolute kPa)	Alvos de pressão de turbo (kPa absoluto)
Browse / Import SD Card	Ver / importar cartão SD
Bypass output pin	Pino de saída do bypass
CAN Broadcast Protocol	Protocolo de envio pela CAN
CAN Broadcasting menu	Menu de envio pela CAN
CAN Data Input	Entrada de dados CAN
CAN Data Out	Saída de dados CAN
CAN Input 0	Entrada CAN #
CAN Input Channel on/off	Canal de entrada CAN liga/desliga
CAN Output 0	Saída CAN #
CAN Output Channel on/off	Canal de saída CAN liga/desliga
Calibrate AFR Table	Calibrar tabela de AFR
Calibrate AFR Sensor	Calibrar sonda (AFR)
Calibrate MAP	Calibrar MAP
Calibrate Pressure Sensors	Calibrar sensores de pressão
Calibrate Thermistor Tables	Calibrar tabelas dos termistores
Calibrate TPS	Calibrar TPS
Calibrate Temperature Sensors	Calibrar sensores de temperatura
Calibrate Voltage Reading	Calibrar leitura de tensão
Cam angle @ 0% duty	Ângulo do comando com #% de duty
CanBus interface	Interface CAN
CanBus/Secondary Serial IO interface	Interface CAN/serial secundária
CanBus/Serial3 IO interface	Interface CAN/serial #
Channel #1	Canal #
Channel 1	Canal #
Channel 2 angle	Ângulo do canal #
Closed Loop settings	Ajustes de malha fechada
Closed Throttle Sensor Enabled	Sensor de borboleta fechada ligado
Closed Throttle Sensor Pin	Pino do sensor de borboleta fechada
Closed Throttle Sensor Pin Polarity	Polaridade do pino do sensor de borboleta fechada
Closed loop	Malha fechada
Closed loop Idle	Marcha lenta em malha fechada
Closed loop initial duty	Duty inicial da malha fechada
Clutch Input Pin	Pino de entrada da embreagem
Clutch Pullup Resistor	Resistor de pull-up da embreagem
Clutch enabled when signal is	Embreagem acionada quando o sinal está
Clutch input	Entrada da embreagem
Cold Advance	Avanço a frio
Cold adjustment	Ajuste a frio
Cold adjustment taper end temperature	Temperatura final da redução do ajuste a frio
Cold adjustment taper start temperature	Temperatura inicial da redução do ajuste a frio
Common Engine Protection	Proteções comuns do motor
Common values are 5% when engine is hot to 50% when engine is cold.	Valores comuns: 5% com o motor quente até 50% com o motor frio.
Component	Componente
Condition 1	Condição #
Control Pin	Pino de controle
Control Type	Tipo de controle
Control interval	Intervalo de controle
Control mode	Modo de controle
Controller Auth +/-	Autoridade do controle +/-
Controller Step Size	Tamanho do passo do controle
Cool time (ms)	Tempo de resfriamento (ms)
Coolant	Temperatura do motor
Coolant A/C Cutout Temp.	Temperatura do motor para cortar o A/C
Coolant Based Rev Limit	Limite de rotação pela temperatura do motor
Coolant Sensor	Sensor de temperatura do motor
Coolant Temp	Temperatura do motor
Coolant Temp. Limiting	Limite pela temperatura do motor
Coolant Temperature	Temperatura do motor
Coolant Temperature Protection	Proteção pela temperatura do motor
Crank to run taper	Transição da partida para o funcionamento
Cranking Enrichment	Enriquecimento de partida
Cranking Enrichment %	Enriquecimento de partida %
Cranking Enrichment Curve	Curva de enriquecimento de partida
Cranking Pulsewidths (ms)	Tempo de injeção na partida (ms)
Cranking RPM (Max)	RPM de partida (máximo)
Cranking Settings	Ajustes de partida
Cranking Timing	Ponto na partida
Cranking advance Angle	Avanço na partida
Cranking bypass	Bypass na partida
Cranking dwell	Dwell na partida
Cranking enrichment taper time	Tempo de redução do enriquecimento de partida
Current WUE	Aquecimento atual
Cut A/C at TPS Position	Cortar A/C a partir do TPS
Cut method	Método de corte
Cutoff RPM	RPM de corte
Cutoff delay	Atraso do corte
Cutoff taper time	Tempo de redução do corte
Cylinder 1 trim	Correção do cilindro #
D	D
Danger	Perigo
Data Logging	Datalogger
Deceleration Enleanment	Empobrecimento na desaceleração
Deceleration Fuel Cutoff (DFCO)	Corte de combustível na desaceleração (cut-off)
Decelleration Fuel Cutoff (DFCO)	Corte de combustível na desaceleração (cut-off)
Defines the fuel enrichment percentage after start.	Define o enriquecimento (%) depois da partida.
Delay before idle control starts (s)	Atraso antes do controle de lenta começar (s)
Detection and Response	Detecção e reação
Differential Gain	Ganho derivativo
Display Type	Tipo de tela
Do not attempt to use this page whilst your engine is running!	Não use esta tela com o motor funcionando!
Don't exceed	Não passar de
Drive in each gear (any speed) and press appropriate button	Ande em cada marcha (qualquer velocidade) e aperte o botão dela
Duration (s)	Duração (s)
Duty %	Duty %
Dwell	Dwell
Dwell Compensation	Compensação do dwell
Dwell Map	Mapa de dwell
Dwell Settings	Ajustes de dwell
Dwell error correction	Correção de erro do dwell
Dwell voltage correction	Correção do dwell pela tensão
ECU must be rebooted after changing above value	Reinicie a ECU depois de mudar o valor acima
EGO delay after start	Atraso da sonda depois da partida
Enable AFR protection	Ligar proteção por AFR
Enable Boost by Gear	Ligar pressão de turbo por marcha
Enable Boost limit	Ligar limite de pressão de turbo
Enable CanBus data Output	Ligar saída de dados CAN
Enable CanBus data input	Ligar entrada de dados CAN
Enable CanBus/Second Serial	Ligar CAN/serial secundária
Enable External data input	Ligar entrada de dados externos
Enable Internal Canbus	Ligar CAN interna
Enable Launch	Ligar controle de largada
Enable Second Serial	Ligar serial secundária
Enable Test Controls	Ligar controles de teste
Enable Test Mode	Ligar modo de teste
Enable cutoff taper	Ligar redução gradual do corte
Enable flat shift	Ligar troca de marcha sem tirar o pé
Enable per tooth timing	Ligar ponto por dente
Enable/Disable	Ligar/desligar
Enabled	Ligado
Enabled Fixed/Locked timing	Ligar ponto fixo
Endianness	Ordem dos bytes
Engine Constants	Dados do motor
Engine Protection	Proteção do motor
Engine Protection RPM min	RPM mínimo da proteção do motor
Engine Protection and Limiters	Proteções e limitadores do motor
Engine load	Carga do motor
Enrich %	Enriquecimento %
Enrichment	Enriquecimento
Enrichment %	Enriquecimento %
Enrichment amount (%)	Quantidade de enriquecimento (%)
Enrichment method	Método de enriquecimento
Enrichment mode	Modo de enriquecimento
Ethanol	Etanol
Event Cut	Corte por evento
External Auxiliary Input Channel Configuration	Configuração das entradas auxiliares externas
External Auxillary Input Channel Configuration	Configuração das entradas auxiliares externas
External Data Input	Entrada de dados externos
External Switch	Chave externa
Fan Mode	Modo da ventoinha
Fan Output Inverted	Saída da ventoinha invertida
Fan Output Inverted (see F1)	Saída da ventoinha invertida (veja F1)
Fan PWM Duty	Duty do PWM da ventoinha
Fan Settings	Ajustes da ventoinha
Fan hysteresis	Histerese da ventoinha
Fan output pin	Pino de saída da ventoinha
Fan switching temperature	Temperatura de ligar a ventoinha
Fan temperature SP	Temperatura alvo da ventoinha
Fan when off	Ventoinha com motor desligado
Fast idle temp	Temperatura da lenta acelerada
Field 1	Campo #
Final enrichment value must be 100%.	O último valor de enriquecimento tem que ser #%.
Final enrichment value must be 100%. Typical maximum is 255% (cold).	O último valor de enriquecimento tem que ser #%. O máximo típico é #% (frio).
First step size	Tamanho do primeiro passo
Fix cranking timing with trigger	Fixar o ponto de partida pelo sinal de rotação
Fixed Angle	Ângulo fixo
Fixed Angle (0 = use map)	Ângulo fixo (# = usar o mapa)
Fixed Rev limit	Limite de rotação fixo
Flat Shift	Troca de marcha sem tirar o pé
Flex Boost Adjustments	Ajustes de pressão de turbo pelo etanol
Flex Fuel	Flex (etanol)
Flex Fuel Adjustments	Ajustes de combustível pelo etanol
Flex Fuel Calibration	Calibração do sensor de etanol
Flex Fuel Sensor	Sensor de etanol
Flex Timing Advance	Avanço pelo etanol
Flex sensor	Sensor de etanol
Flex sensor filter	Filtro do sensor de etanol
Flood Clear level	Nível de desafogar
For 99% of engines, warmup must have 100% in the final row. Typical maximum is 255% (cold).	Em #% dos motores o aquecimento precisa ter #% na última linha. O máximo típico é #% (frio).
Forcing the Injector or Spark outputs could cause flooding of your engine or permanent damage to ignition coils!	Forçar as saídas de bico ou de ignição pode afogar o motor ou queimar as bobinas!
Format SD card	Formatar cartão SD
Fuel	Combustível
Fuel Adjustment	Ajuste de combustível
Fuel Amount	Quantidade de combustível
Fuel Modifier	Modificador de combustível
Fuel Multiplier%	Multiplicador de combustível %
Fuel Pressure	Pressão de combustível
Fuel Pump	Bomba de combustível
Fuel Sensor Settings	Ajustes do sensor de combustível
Fuel Staging Table	Tabela de injeção escalonada
Fuel Table	Mapa de combustível
Fuel Table 2	Mapa de combustível #
Fuel Temp Correction	Correção pela temperatura do combustível
Fuel Temperature	Temperatura do combustível
Fuel adder @ Max RPM	Combustível somado no RPM máximo
Fuel adder @ Min RPM	Combustível somado no RPM mínimo
Fuel adder during launch	Combustível somado na largada
Fuel pump pin	Pino da bomba de combustível
Fuel pump prime duration	Tempo de escorvar da bomba
Fuel trim Table 1	Tabela de correção de combustível #
Fuel/Oil pressure	Pressão de combustível/óleo
Gauge Limits	Limites dos mostradores
Gear 1	Marcha #
Gear Detection	Detecção de marcha
Hard Limit Configuration	Configuração do limite fixo
Hard Rev limit	Limite de rotação fixo
Hard limiter method	Método do limitador fixo
Hard limiter mode	Modo do limitador fixo
Help	Ajuda
Hardware Testing	Testes de hardware
High	Alto
High (E100)	Alto (E#)
Higher values result in stronger filtering, but slower response times for readings	Valores maiores filtram mais, mas a leitura responde mais devagar
Hold duty	Duty de retenção
Hold duty used	Duty de retenção usado
Home steps	Passos até a posição inicial
How long time the After Start Enrichment is applied in seconds.	Por quanto tempo (s) o enriquecimento pós-partida fica ligado.
However if timing issues are encountered, please disable this	Mas se houver problema de ponto, desligue isto
I	I
I/O Summary	Resumo de entradas e saídas
IAC Closed Loop Targets	Alvos da lenta em malha fechada
IAC PWM Cranking Duty	Duty da válvula de lenta na partida
IAC PWM Duty	Duty da válvula de lenta (PWM)
IAC Stepper Motor	Motor de passo da lenta
IAC Stepper Motor Cranking	Motor de passo da lenta na partida
IAT Density	Densidade pela temperatura do ar
IAT density correction	Correção de densidade pela temperatura do ar
IAT timing retard	Atraso de ponto pela temperatura do ar
Idle - Closed loop targets	Lenta - alvos de malha fechada
Idle - PWM Cranking Duty Cycle	Lenta - duty na partida (PWM)
Idle - PWM Duty Cycle	Lenta - duty (PWM)
Idle - RPM targets	Lenta - alvos de RPM
Idle - Stepper Motor	Lenta - motor de passo
Idle - Stepper Motor Cranking	Lenta - motor de passo na partida
Idle Advance	Avanço na lenta
Idle Advance Settings	Ajustes do avanço na lenta
Idle Control	Controle de lenta
Idle RPM Targets	Alvos de RPM da lenta
Idle Settings	Ajustes da lenta
Idle Up Amount	Quantidade de idle-up
Idle Up Enabled	Idle-up ligado
Idle Up Input Settings	Ajustes da entrada de idle-up
Idle Up Output Enabled	Saída de idle-up ligada
Idle Up Output Inverted	Saída de idle-up invertida
Idle Up Output Pin	Pino de saída do idle-up
Idle Up Output Settings	Ajustes da saída de idle-up
Idle Up Pin	Pino do idle-up
Idle Up Pin Polarity	Polaridade do pino do idle-up
Idle Up Polarity	Polaridade do idle-up
Idle Up Settings	Ajustes do idle-up
Idle Up When A/C Compressor On	Idle-up com o compressor do A/C ligado
Idle advance mode	Modo do avanço na lenta
Idle control type	Tipo de controle de lenta
Idle detect mode	Modo de detectar a lenta
Idle valve direction	Sentido da válvula de lenta
Idle valve frequency	Frequência da válvula de lenta
Idle-Up Amount	Quantidade de idle-up
Idle-Up RPM Adder	RPM somado pelo idle-up
If Secondary Serial or Internal CANBUS is DISABLED then any input channel assigned to that external source will NOT function	Se a serial secundária ou a CAN interna estiver DESLIGADA, os canais ligados a essa fonte externa NÃO funcionam
Iginition advance correction	Correção do avanço
Ignition Advance Table	Mapa de avanço de ignição
Ignition Configuration	Configuração da ignição
Ignition Events per Step	Eventos de ignição por passo
Ignition advance correction	Correção do avanço
Ignition load	Carga da ignição
Ignition load source	Fonte de carga da ignição
Ignition retard when active	Atraso de ponto quando ativo
In closed loop mode, the values are boost targets in kPa	Em malha fechada, os valores são alvos de pressão em kPa
In closed loop mode, the values in this table are boost targets in kPa	Em malha fechada, os valores desta tabela são alvos de pressão em kPa
In open loop mode, the values in this table are duty cycle %	Em malha aberta, os valores desta tabela são duty %
Include AFR directly	Incluir o AFR direto
Increased duty direction	Sentido de aumento do duty
Individual channel setting	Ajuste por canal
Individual fuel trim enabled	Correção por cilindro ligada
Injector	Bico
Injector CH1	Bico canal #
Injector Characteristics	Características dos bicos
Injector Cyl 1-4 Trims	Correção dos cilindros #-#
Injector Driver Output Test	Teste das saídas de bico
Injector Duty Limit	Limite de duty do bico
Injector Layout	Ligação dos bicos
Injector Open Time	Tempo de abertura do bico
Injector Pairing	Pareamento dos bicos
Injector close angle	Ângulo de fim da injeção
Injector close angles	Ângulos de fim da injeção
Injector opening time	Tempo de abertura do bico
Injector timing	Fase da injeção
Injector voltage correction	Correção do bico pela tensão
Injectors priming delay	Atraso do escorvamento dos bicos
Inlet Air Temp	Temperatura do ar
Inlet Air Temp sensor	Sensor de temperatura do ar
Input Alias	Nome da entrada
Input Options	Opções da entrada
Input Parameter Group	Grupo do parâmetro de entrada
Input Parameter Number of Bytes	Número de bytes do parâmetro de entrada
Input Parameter Start Byte	Byte inicial do parâmetro de entrada
Integeral reset RPM Hysteresis	Histerese de RPM para zerar o integral
Integeral reset above TPS	Zerar o integral acima do TPS
Integral Gain	Ganho integral
Integral reset RPM Hysteresis	Histerese de RPM para zerar o integral
Integral reset above TPS	Zerar o integral acima do TPS
Is	É
Knock Mode	Modo do sensor de detonação
Knock Pin	Pino do sensor de detonação
Knock Settings	Ajustes do sensor de detonação
Knock Window	Janela de detonação
Knock Window Duration	Duração da janela de detonação
Knock Windows	Janelas de detonação
Knock active when pin is	Detonação ativa quando o pino está
Knock count required	Quantidade de batidas necessária
Knock threshold required	Nível de detonação necessário
Lambda Table	Mapa de lambda
Lambda Target Table	Mapa de lambda alvo
Launch / Flat Shift switch RPM	RPM de troca largada / troca sem tirar o pé
Launch Control	Controle de largada
Launch Control / Flat Shift	Controle de largada / troca sem tirar o pé
Launch Input Pin	Pino de entrada da largada
Launch Pullup Resistor	Resistor de pull-up da largada
Launch enabled when signal is	Largada acionada quando o sinal está
Leanest AFR	AFR mais pobre
Leanest Lambda	Lambda mais pobre
Legacy Options	Opções antigas
Limit	Limite
Limit time active	Tempo máximo no limite
Limiters	Limitadores
Load source	Fonte de carga
Local Analog Source 0 Pin No	Fonte analógica local # - pino
Local Auxiliary Input Channel Configuration	Configuração das entradas auxiliares locais
Local Auxillary Input Channel Configuration	Configuração das entradas auxiliares locais
Local Digital Source 0 Pin No	Fonte digital local # - pino
Locked timing	Ponto fixo
Lockout time after high TPS	Tempo de bloqueio depois de TPS alto
Lockout time after high/low RPM	Tempo de bloqueio depois de RPM alto/baixo
Log Configuration	Configuração do log
Log rate	Taxa do log
Logger type	Tipo de log
Low	Baixo
Low (E0)	Baixo (E#)
MAP Sample method	Método de leitura do MAP
MAP Sample switch point	RPM de troca do método de leitura do MAP
MAP based AE	Enriquecimento na aceleração pelo MAP
MAPdot	Variação do MAP
MAPdot Threshold	Limite de variação do MAP
Max Total retard	Atraso total máximo
Max dwell time	Tempo máximo de dwell
Max. RPM for A/C Operation	RPM máximo para o A/C
Maximum AFR	AFR máximo
Maximum AFR deviation	Desvio máximo de AFR
Maximum Cam angle	Ângulo máximo do comando
Maximum Engage RPM	RPM máximo para acionar
Maximum MAP	MAP máximo
Maximum RPM	RPM máximo
Maximum lambda	Lambda máximo
Maximum lambda deviation	Desvio máximo de lambda
Maximum valve duty	Duty máximo da válvula
Maximum valve value	Valor máximo da válvula
Min. Duty for PWM Cooling Fan	Duty mínimo da ventoinha PWM
Min. MAP change	Variação mínima do MAP
Min. RPM for A/C Operation	RPM mínimo para o A/C
Min. TPS change	Variação mínima do TPS
Min. Time between events	Tempo mínimo entre eventos
Minimum	Mínimo
Minimum CLT	Temperatura mínima do motor
Minimum Cam angle	Ângulo mínimo do comando
Minimum Engage RPM	RPM mínimo para acionar
Minimum PSI	PSI mínimo
Minimum Steps	Passos mínimos
Minimum TPS	TPS mínimo
Minimum engine RPM	RPM mínimo do motor
Minimum engine temperature	Temperatura mínima do motor
Minimum manifold air pressure	Pressão mínima no coletor
Minimum throttle position	Posição mínima da borboleta
Minimum valve duty	Duty mínimo da válvula
Minimum valve value	Valor mínimo da válvula
Missing teeth	Dentes faltantes
Mode	Modo
Motor	Motor
Multiply VE value by MAP	Multiplicar o VE pelo MAP
Multiply VE value by MAP ratio	Multiplicar o VE pela razão do MAP
Multiply VE value by MAP:Baro ratio	Multiplicar o VE pela razão MAP/pressão atmosférica
Multiply by ratio of AFR to Target AFR	Multiplicar pela razão entre AFR e AFR alvo
Multiply by ratio of stoich AFR/target AFR (incorporate AFR)	Multiplicar pela razão AFR estequiométrico/AFR alvo (incorporar AFR)
NOTE! Realtime Data Base Address MUST be at least 0x16 GREATER than the True Address as they are reserved for future expansion	NOTA: o endereço base dos dados em tempo real PRECISA ser pelo menos 0x16 MAIOR que o endereço real (reservado para expansão)
NOTE! Realtime Datat Base Address MUST be at least 0x16 GREATER than the True Address as they are reserved for future expansion	NOTA: o endereço base dos dados em tempo real PRECISA ser pelo menos 0x16 MAIOR que o endereço real (reservado para expansão)
NOTE! True address + 1 to 15 are reserved for future expansion	NOTA: endereço real + # a # ficam reservados para expansão
New Ignition Mode	Modo novo de ignição
Nitrous	Nitro
Nitrous Mode	Modo do nitro
Nitrous Output Pin	Pino de saída do nitro
Nitrous is armed when pin is	Nitro armado quando o pino está
Note: Set the maximum dwell time at least 3ms above	Nota: ajuste o dwell máximo pelo menos #ms acima
Note: This is the number of revolutions that will be skipped during	Nota: este é o número de voltas puladas durante
Number of Bytes	Número de bytes
Number of Sec to run	Segundos de funcionamento
Number of outputs	Número de saídas
O2 sensor	Sonda lambda
OFF (Max RPM)	DESLIGA (RPM máximo)
OFF threshold	Limite para desligar
OLED Display	Tela OLED
ON (Min RPM)	LIGA (RPM mínimo)
ON threshold	Limite para ligar
Oddfire Angles	Ângulos de motor com ignição irregular
Off	Desligado
Offset	Ajuste
Oil Pressure	Pressão de óleo
Oil Pressure Protection	Proteção por pressão de óleo
Oil Pressure cut delay	Atraso do corte por pressão de óleo
On	Ligado
On - 100% DC	Ligar - #% de duty
On - Pulsed	Ligar - pulsando
On Boot	Ao ligar
On Boot log duration	Duração do log ao ligar
On-board logger	Log na placa
Only correct above	Só corrigir acima de
Other step size	Tamanho dos outros passos
Output Parameter Group	Grupo do parâmetro de saída
Output Parameter Number of Bytes	Número de bytes do parâmetro de saída
Output Parameter Start Byte	Byte inicial do parâmetro de saída
Output Pin Num	Número do pino de saída
Output Polarity	Polaridade da saída
Output pin	Pino de saída
Output speed	Velocidade de saída
Outputs WILL NOT work if incorrect board is selected	As saídas NÃO funcionam se a placa errada for escolhida
Overdwell protection	Proteção contra dwell excessivo
P	P
PID Derivative	PID derivativo
PID Integral	PID integral
PID Proportional Gain	PID ganho proporcional
PIN	PINO
PW	Tempo de injeção
PWM Fan Curve	Curva da ventoinha PWM
PWM Idle	Lenta por PWM
PWM fan frequency	Frequência do PWM da ventoinha
Per tooth ignition events	Eventos de ignição por dente
Pin No	Pino
Pin number	Número do pino
Pressure Transducers	Sensores de pressão
Pressure at 0v	Pressão em #v
Primary Boost table	Mapa principal de pressão de turbo
Primary base teeth	Dentes base do sinal primário
Primary trigger speed	Velocidade do sinal primário
Priming Pulsewidth	Tempo de injeção do escorvamento
Programmable outputs	Saídas programáveis
Proportional Gain	Ganho proporcional
Protection Cut	Corte de proteção
Protection RPM Limit ('Limp Home')	Limite de RPM de proteção (modo de emergência)
Pulse duration	Duração do pulso
Pulses Per KM	Pulsos por km
Pulses Per KM/VSS ratio	Pulsos por km/razão do sensor de velocidade
RPM Delta	Diferença de RPM
RPM Hysteresis	Histerese de RPM
RPM Limiting	Limite de RPM
Re-sync every cycle	Ressincronizar a cada ciclo
Reactivate below throttle	Reativar abaixo da borboleta
Real Time Clock	Relógio
Real Time Clock Trim +/-	Ajuste fino do relógio +/-
Real Time Clock mode	Modo do relógio
Realtime Data Base Can Address	Endereço CAN base dos dados em tempo real
Reboot to bootloader	Reiniciar no bootloader
Reboot to system	Reiniciar o sistema
Recovery step size	Tamanho do passo de recuperação
Recovery step time	Tempo do passo de recuperação
Reset Control	Reiniciar controle
Retard duration	Duração do atraso
Rev Limiter	Limitador de rotação
Rev Limiters	Limitadores de rotação
Rev Limits	Limites de rotação
Rolling Cut Percent	Porcentagem do corte alternado
Rotary Ignition	Ignição de motor rotativo
Rotary Trailing Split	Separação trailing (rotativo)
Rule 1	Regra #
Rule Alias	Nome da regra
Run Engine Cooling Fan with A/C	Ligar a ventoinha com o A/C
Run before start	Ligar antes da partida
Running dwell	Dwell em funcionamento
STM32 Commands	Comandos STM#
Second Ignition Advance Table	Segundo mapa de avanço de ignição
Second Serial protocol	Protocolo da serial secundária
Second VVT output	Segunda saída de VVT
Second fuel Table	Segundo mapa de combustível
Second spark Table	Segundo mapa de ignição
Secondary Serial IO Interface	Interface da serial secundária
Secondary advance table mode	Modo do segundo mapa de avanço
Secondary fuel table mode	Modo do segundo mapa de combustível
Secondary teeth	Dentes do sinal secundário
Secondary trigger edge	Borda do sinal secundário
Select Rule Number	Escolha o número da regra
Sensitivity	Sensibilidade
Sensor Frequency	Frequência do sensor
Sensor Type	Tipo de sensor
Sequential fuel trim	Correção de combustível por cilindro
Sequential fuel trim (1-4)	Correção de combustível por cilindro (#-#)
Sequential ignition trim	Correção de ignição por cilindro
Serial/CAN	Serial/CAN
Serial3 IO Interface	Interface da serial #
Set Gear 1	Gravar marcha #
Set analog sensor filters	Ajustar filtros dos sensores analógicos
Settings	Configurações
Setup onboard logger / SD	Configurar log na placa / SD
Setup realtime clock	Ajustar o relógio
Size of primary injectors	Vazão dos bicos primários
Size of secondary injectors	Vazão dos bicos secundários
Skip Revolutions	Voltas puladas
Smoothing Factor	Fator de suavização
Soft limit absolute timing	Ponto absoluto no limitador suave
Soft limit max time	Tempo máximo no limitador suave
Soft limit timing	Ponto no limitador suave
Soft limiter mode	Modo do limitador suave
Soft rev limit	Limite de rotação suave
Soft rev window	Faixa do limitador suave
Source	Fonte
Source CAN Address	Endereço CAN de origem
Spark	Ignição
Spark CH1	Ignição canal #
Spark Driver Output Test	Teste das saídas de ignição
Spark Outputs triggers	Gatilho das saídas de ignição
Spark Table 2	Mapa de ignição #
Spark duration	Duração da centelha
Spark output mode	Modo da saída de ignição
Speed ratio 1	Relação de velocidade #
Speeduino Board	Placa Speeduino
Speeduino Help	Ajuda da Speeduino
Speeduino OBD address	Endereço OBD da Speeduino
Speeduino TsCanId	ID CAN da Speeduino no TunerStudio
Split	Separação
SplitDegrees	Graus de separação
Stage 1	Estágio #
Staged Injection	Injeção escalonada
Staging enabled	Escalonamento ligado
Staging mode	Modo do escalonamento
Stand-Alone A/C Fan	Ventoinha do A/C independente
Stand-Alone A/C Fan Output Pin	Pino de saída da ventoinha do A/C
Stand-Alone A/C Fan Output Polarity	Polaridade da saída da ventoinha do A/C
Starting/Idle	Partida/Lenta
Startup/Idle	Partida/Lenta
Step Hysteresis	Histerese do passo
Step time	Tempo do passo
Step time (ms)	Tempo do passo (ms)
Stepper Idle	Lenta por motor de passo
Stepper Inverted	Motor de passo invertido
Stepper Power	Alimentação do motor de passo
Stoichiometric ratio	Razão estequiométrica
Stop Test Mode	Parar modo de teste
Switch Conditions	Condições de troca
TPS Limiting	Limite pelo TPS
TPS Threshold	Limite do TPS
TPS based AE	Enriquecimento na aceleração pelo TPS
TPSdot	Variação do TPS
TPSdot Threshold	Limite de variação do TPS
Tacho	Conta-giros
Tacho Output	Saída do conta-giros
Tacho pulse mode	Modo do pulso do conta-giros
Tacho sweep Max RPM	RPM máximo da varredura do conta-giros
Tacho sweep on boot	Varredura do conta-giros ao ligar
Taper End RPM	RPM final da redução
Taper Start RPM	RPM inicial da redução
Taper advance remove	Retirada gradual do avanço
Taper end fuel amount	Quantidade de combustível no fim da redução
Target Adjustment	Ajuste do alvo
Temp	Temperatura
Test Output Hardware	Testar saídas
Test pulse duration	Duração do pulso de teste
The above times are for 12V. Voltage correction	Os tempos acima são para #V. A correção pela tensão
The values here set the amount of filtering to apply to each analog input	Os valores aqui definem quanto filtrar cada entrada analógica
Thermo Fan	Ventoinha
They should only be enabled if you have a specific requirement and understand their function	Só ligue estas opções se você precisa delas e entende a função
This is needed to keep engine running after start	Isto é necessário para o motor continuar funcionando depois da partida
This number represents the angle ATDC when	Este número é o ângulo depois do PMS quando
This option is currently will improve accuracy on most compatible triggers	Esta opção melhora a precisão na maioria das rodas fônicas compatíveis
This option is will generally improve accuracy on most compatible triggers	Esta opção melhora a precisão na maioria das rodas fônicas compatíveis
Throttle Position Sensor	Sensor de posição da borboleta (TPS)
Time	Tempo
Time before cut	Tempo antes do corte
Time before recovery	Tempo antes da recuperação
Tools	Ferramentas
Total retard	Atraso total
Transition time to disable	Tempo de transição para desligar
Trigger Angle	Ângulo da roda fônica
Trigger Filter	Filtro do sinal de rotação
Trigger Pattern	Padrão da roda fônica
Trigger Settings	Ajustes da roda fônica
Trigger angle multiplier	Multiplicador do ângulo da roda fônica
Trigger edge	Borda do sinal de rotação
Triggers	Sinais de rotação
True Canbus Address	Endereço CAN real
Tuning	Acerto
Use EMAP sensor	Usar sensor EMAP
Use Overdwell protection	Usar proteção contra dwell excessivo
Use VVT map as On / Off only	Usar mapa de VVT só como liga/desliga
Use dwell map	Usar mapa de dwell
Use external Baro sensor	Usar sensor de pressão atmosférica externo
Use internal pullup on pin	Usar pull-up interno no pino
Use legacy MAP reading	Usar leitura antiga do MAP
Use new ignition mode	Usar modo novo de ignição
Use pullup	Usar pull-up
Use secondary table when pin	Usar o segundo mapa quando o pino
Use secondary table when	Usar o segundo mapa quando
User new ignition mode	Usar modo novo de ignição
User per tooth ignition calculation	Calcular a ignição por dente
Usually this is varies from 1-2s when engine is hot up to 20s on a cold engine.	Normalmente vai de #-#s com o motor quente até #s com o motor frio.
VAG Instrument Cluster Broadcast	Envio para o painel de instrumentos VAG
VSS Aux in Channel	Canal auxiliar do sensor de velocidade
VSS Calibration	Calibração do sensor de velocidade
VSS Input Mode	Modo da entrada do sensor de velocidade
VSS Pin	Pino do sensor de velocidade
VSS and Gear detection	Velocidade e detecção de marcha
VVT Control	Controle do VVT
VVT Control Enabled	Controle do VVT ligado
VVT Delay	Atraso do VVT
VVT Minimum CLT	Temperatura mínima do motor para o VVT
VVT Mode	Modo do VVT
VVT Target/Duty	VVT: alvo/duty
VVT angle filter	Filtro do ângulo do VVT
VVT control Table	Mapa de controle do VVT
VVT duty cycle	Duty do VVT
VVT output pin	Pino de saída do VVT
VVT solenoid freq.	Frequência da válvula do VVT
VVT2 Cam angle @ 0% duty	VVT#: ângulo do comando com #% de duty
VVT2 Control Enabled	Controle do VVT# ligado
VVT2 Target/Duty	VVT#: alvo/duty
VVT2 Trigger edge	Borda do sinal do VVT#
VVT2 control Table	Mapa de controle do VVT#
VVT2 duty cycle	Duty do VVT#
VVT2 output pin	Pino de saída do VVT#
Value At 0.0 Volts	Valor em # volts
Values are specified as modifiers to the normal fueling. Eg 100% = No change.	Os valores modificam o combustível normal. Ex.: #% = sem mudança.
Values are specified as modifiers to the normal fuelling. Eg 100% = No change.	Os valores modificam o combustível normal. Ex.: #% = sem mudança.
Valve	Válvula
Valve duty when below threshold	Duty da válvula abaixo do limite
Valve maximum duty cycle	Duty máximo da válvula
Valve minimum duty cycle	Duty mínimo da válvula
Voltage	Tensão
Vss threshold	Limite do sensor de velocidade
WBO over CAN	Wideband pela CAN
WMI Control	Controle do WMI (injeção de água/metanol)
WMI Control Enabled	Controle do WMI ligado
WMI Mode	Modo do WMI
WMI PWM freq.	Frequência do PWM do WMI
WMI PWM output pin	Pino de saída do PWM do WMI
WMI Timing Advance	Avanço do WMI
WMI control Table	Mapa de controle do WMI
WMI duty cycle	Duty do WMI
WMI enabled output pin	Pino de saída de WMI ligado
WMI max MAP	MAP máximo do WMI
WMI min IAT	Temperatura do ar mínima do WMI
WMI min MAP	MAP mínimo do WMI
WMI min RPM	RPM mínimo do WMI
WMI min TPS	TPS mínimo do WMI
WMI offset	Ajuste do WMI
WMI tank empty input	Entrada de tanque do WMI vazio
WMI tank empty pin	Pino de tanque do WMI vazio
WMI tank empty polarity	Polaridade do tanque do WMI vazio
WMI tank indicator output	Saída do indicador do tanque do WMI
WMI tank indicator pin	Pino do indicador do tanque do WMI
WMI tank indicator polarity	Polaridade do indicador do tanque do WMI
WUE %	Aquecimento %
Warmup Enrichment (WUE) - Percent Multiplier	Enriquecimento de aquecimento - multiplicador %
Warmup Enrichment (WUE) Curve	Curva de enriquecimento de aquecimento
Warning	Atenção
Window Duration	Duração da janela
Window Start	Início da janela
and correct below	e corrigir abaixo de
and when low it is increased	e quando baixo ele aumenta
cranking before the injectors and coils are fired	na partida antes de os bicos e bobinas funcionarem
during	durante
if(	se(
is applied. At higher voltages the time is reduced	é aplicada. Com tensões maiores o tempo diminui
is greater than	é maior que
kPa	kPa
kPa At 0.0 Volts	kPa em # volts
output time	tempo de saída
source data start byte	byte inicial dos dados de origem
tooth #1 passes the primary sensor.	o dente # passa pelo sensor primário.
your desired dwell time (Including cranking)	o dwell desejado (incluindo partida)
`;

export const OPCOES = `
!= (different)	!= (diferente)
& (and)	& (e)
< (smaller)	< (menor)
<= (smaller/equal)	<= (menor/igual)
== (equal)	== (igual)
> (greater)	> (maior)
>= (greater/equal)	>= (maior/igual)
^ (xor)	^ (ou exclusivo)
AND	E
OR	OU
Active high	Ativo em alto
Active low	Ativo em baixo
Added	Somado
Advance	Avanço
Aggressive	Agressivo
Alternating	Alternado
Always	Sempre
Analog	Analógico
Automatic	Automático
Board Default	Padrão da placa
Both	Ambos
Cam Speed	Velocidade do comando
Closed Loop	Malha fechada
Closed loop	Malha fechada
Closedloop	Malha fechada
Constant limit	Limite constante
Coolant based	Pela temperatura do motor
Crank Speed	Velocidade do virabrequim
Cycle Average	Média do ciclo
Cycle Minimum	Mínimo do ciclo
Digital	Digital
Disable	Desligar
Disabled	Desligado
Dual Wheel	Roda dupla
Dwell control	Controle de dwell
Enable	Ligar
Enabled	Ligado
Even fire	Ignição regular
Event Average	Média do evento
External Source	Fonte externa
FALLING	DESCIDA
False	Não
Fixed	Fixo
Fixed Duration	Duração fixa
Fixed mode	Modo fixo
Four-stroke	Quatro tempos
Fuel Only	Só combustível
Full	Completo
Going High	Subindo
Going Low	Descendo
HIGH	ALTO
Half	Metade
High	Alto
Instantaneous	Instantâneo
Internal pullup	Pull-up interno
Inverted	Invertido
LOW	BAIXO
Leading	Leading
Low	Baixo
Match Dwell	Igual ao dwell
Maximum	Máximo
Medium	Médio
Minimum	Mínimo
Missing Tooth	Dente faltante
Multiplied	Multiplicado
Multiplied %	Multiplicado %
Narrow Band	Banda estreita
No	Não
No correction	Sem correção
None	Nenhum
Normal	Normal
Odd fire	Ignição irregular
Off	Desligado
On	Ligado
On Via Secondary Serial	Ligado pela serial secundária
On boot	Ao ligar
On-board	Na placa
On/Off	Liga/desliga
One	Um
Open Loop	Malha aberta
Open Time only	Só o tempo de abertura
Openloop	Malha aberta
Overwrite	Substituir
PW	Tempo de injeção
PW Adder	Soma no tempo de injeção
PW Multiplier	Multiplica o tempo de injeção
PWM Closed loop	PWM malha fechada
PWM Closed+Open loop	PWM malha fechada+aberta
PWM Open loop	PWM malha aberta
Paired	Em pares
Poll level	Nível lido
Proportional	Proporcional
Pulses per KM	Pulsos por km
Pulses per mile	Pulsos por milha
RISING	SUBIDA
Retard	Atraso
Reverse	Invertido
Rolling	Alternado
Rotary	Rotativo
Semi-Sequential	Semissequencial
Sequential	Sequencial
Serial Command	Comando serial
Simple	Simples
Simultaneous	Simultâneo
Single Channel	Canal único
Single tooth cam	Comando com um dente
Spark Only	Só ignição
Speed Density	Speed density (MAP)
Stepper Closed Loop	Motor de passo malha fechada
Stepper Closed+Open loop	Motor de passo malha fechada+aberta
Stepper Open Loop	Motor de passo malha aberta
Switched	Liga/desliga
Switched - Conditional	Liga/desliga - por condição
Switched - Input based	Liga/desliga - por entrada
Table	Tabela
Table mode	Modo tabela
Throttle Body	Corpo de borboleta
Trailing	Trailing
Two	Dois
Two-stroke	Dois tempos
Unused	Sem uso
Via Internal CAN	Pela CAN interna
Via Secondary Serial	Pela serial secundária
Voltage	Tensão
Wasted COP	Centelha perdida (bobina individual)
Wasted Spark	Centelha perdida
Weak	Fraco
When Active	Quando ativo
Whole PW	Todo o tempo de injeção
Wide Band	Banda larga
Yes	Sim
toggle	alternar
True	Sim
`;
