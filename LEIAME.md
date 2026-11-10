# App da interface da ECU (versão 0.30, 01/11/2026)

App touch no estilo profissional para a nossa ECU (base rusEFI). Tela desenhada em 1024×600 (7"), escala para qualquer janela.

## Como funciona
- `src/core/ini.ts`: lê o arquivo .ini que o build do firmware gera. Campos novos do firmware aparecem sozinhos.
- `src/core/protocol.ts`: protocolo do TunerStudio (assinatura, canais ao vivo, ler/escrever/gravar a configuração).
- `src/bridge/demo.ts`: modo demonstração, ECU falsa com valores de exemplo e sensores que andam sozinhos.
- `src/bridge/`: a "ponte". Fala com a ECU (rede do simulador; USB depois) e com a tela por WebSocket.
- `src/ui/`: as telas (React). Prontas: Conexão (com modo demonstração), Painel, Mapa de injeção em ms, Mapa de ignição, Alertas, Gerenciador de ajustes, Configuração do motor, Outras funções, Sensores e calibração, Diagnóstico, Favoritos, Configuração da interface (unidades bar/psi e lambda/AFR em `prefs.ts`), Menu principal, Importar mapa .ftm .ftm (em Gerenciador de ajustes: injeção em ms, ignição, lambda alvo, correções por temperatura; `src/core/ftm.ts`, exportar pronto mas escondido). Submenus (`SubMenu.tsx`) com curvas de compensação (`Curva.tsx`, lista CURVAS) e tabelas menores (TABELAS em `MapaInjecao.tsx`: por marcha, pós-partida, turbo); telas de configuração internas em FORMS (`Configuracoes.tsx`, tela f_<chave>). v0.11: todas as nossas funções têm tela: lambda alvo, LTFT (`Ltft.tsx`), tempo morto, saídas PWM 1-8, CAN personalizada 1-8, saídas e entradas (pinos), pedal, fase com janela, lenta, ventoinhas/A/C/VTEC, troca de marcha, curvas de 8 pontos, teste de saídas (`Testes.tsx`, op `cmd` = botões cmd_* do .ini). Falta: Funções de arrancada (fica para o fim). `Formulario.tsx` monta telas de configuração a partir de uma lista de campos do .ini.
- `ini/simulador.ini`: .ini do simulador montado com todos os nossos itens (assinatura ui-base.2026.10.31).

## Rodar
Precisa do Node.js 22 (instalador oficial em nodejs.org, não precisa de Homebrew).
```
npm install
npm start            # monta a tela e abre a ponte em http://localhost:8600
```
Modo demonstração (ECU falsa, não precisa de simulador nem placa): na tela Conexão escolha "Demonstração", ou abra já ligado com `DEMO=1 npm start`.
Para ligar direto no simulador ao abrir: `AUTO_CONNECT=127.0.0.1:29001 npm start`.
Outro .ini (placa de verdade): `ECU_INI=/caminho/rusefi_proteus_f4.ini npm start`.

## Testes de bancada
- `npx tsx test/conferir-ini.ts`: confere se todo campo, curva, tabela e comando das telas existe no .ini.
- `npx tsx test/probe.ts`: conecta no simulador e mostra alguns valores.
- `npx tsx test/sim-sensores.ts 5200`: põe valores de exemplo nos sensores do simulador (porta 29002).

## Testes com o simulador real da rusEFI (Linux/nuvem; o simulador não roda no macOS)
Simulador ligado (porta 29001 para o app, 29002 para comandos), ninguém mais conectado:
- `npx tsx test/sim-campos.ts`: escreve, lê de volta e restaura cada campo que as telas usam.
- `npx tsx test/sim-funcoes.ts`: dados ao vivo, mapa ms, ajustes, alerta, shift light, cilindros/ordem, comandos, LTFT, mapa padrão, senhas, gravar.
- `npx tsx test/sim-burn.ts gravar`, reiniciar o simulador, `npx tsx test/sim-burn.ts conferir`.
- `npx tsx test/conferir-canais.ts`: canais ao vivo pedidos pelas telas existem no .ini.

## Falta
- Janela própria (Electron) e cabo USB/serial.
- Demais telas do canvas, biblioteca de sensores.

## App de Mac (.dmg)
- `npm run app`: abre a janela (Electron) direto do código.
- `npm run dist:mac`: gera `release/ECU-<versão>-mac-intel.dmg` (sem assinatura digital).
- Primeira vez no Mac: arraste o ECU para Aplicativos, clique com o botão direito > Abrir > Abrir.
  No macOS 15, se aparecer "não pode ser aberto": Ajustes do Sistema > Privacidade e Segurança > "Abrir Mesmo Assim".
- Cabo USB: tela Conexão > Cabo USB > escolha a porta `cu.usbmodem…`. A placa precisa usar o mesmo .ini do app.
