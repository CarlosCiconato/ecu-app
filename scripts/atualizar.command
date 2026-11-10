#!/bin/zsh
# Atualiza e abre o app da ECU no modo demonstração.
# Pega o arquivo ecu-app-v*.tar.gz mais novo da pasta Downloads.
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
ARQ=$(ls -t ~/Downloads/ecu-app-v*.tar.gz 2>/dev/null | head -1)
lsof -ti :8600 | xargs kill 2>/dev/null
sleep 1
if [ -n "$ARQ" ]; then
  echo "Instalando $(basename $ARQ)..."
  mkdir -p ~/ecu && tar xzf "$ARQ" -C ~/ecu
fi
cd ~/ecu/ecu-app || exit 1
npm install --no-audit --no-fund --silent
(sleep 6; open http://localhost:8600) &
echo "App aberto no navegador. Para fechar o app, feche esta janela."
DEMO=1 npm start
