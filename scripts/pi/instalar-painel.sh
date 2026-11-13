#!/bin/bash
# Instala o app ECU no Raspberry Pi (Raspberry Pi OS 64 bits, com tela de 7" touch) como painel do carro.
# Uso no Pi (com internet):  bash instalar-painel.sh
# Se houver um ECU-x.y.z-raspberry-pi-arm64.deb na mesma pasta, usa ele; senão baixa o código e monta o .deb no próprio Pi.
set -e
DEB=$(ls -t ECU-*-raspberry-pi-arm64.deb 2>/dev/null | head -1 || true)
if [ -z "$DEB" ]; then
  echo "Montando o app no Pi (uns 10 minutos na primeira vez)…"
  sudo apt-get install -y git curl ca-certificates
  if ! node -v 2>/dev/null | grep -q '^v2[2-9]'; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  [ -d ~/ecu-app ] || git clone https://github.com/CarlosCiconato/ecu-app ~/ecu-app
  (cd ~/ecu-app && git pull --ff-only && npm ci && npm run dist:pi)
  DEB=$(ls -t ~/ecu-app/release/ECU-*-raspberry-pi-arm64.deb | head -1)
  cp "$DEB" . && DEB=$(basename "$DEB")
fi
echo "Instalando $DEB…"
sudo apt-get install -y "./$DEB"

# Porta USB (bancada) sem senha
sudo usermod -aG dialout "$USER" || true

# Abre sozinho em tela cheia quando o Pi liga (Wayland/labwc do Bookworm e X11/LXDE antigo)
mkdir -p ~/.config/autostart ~/.config/labwc
cat > ~/.config/autostart/ecu-painel.desktop <<EOT
[Desktop Entry]
Type=Application
Name=ECU painel
Exec=/opt/ECU/ecu --painel
X-GNOME-Autostart-enabled=true
EOT
grep -q "ecu --painel" ~/.config/labwc/autostart 2>/dev/null || echo "/opt/ECU/ecu --painel &" >> ~/.config/labwc/autostart

# Tela nunca apaga sozinha
command -v raspi-config >/dev/null && sudo raspi-config nonint do_blanking 1 || true

echo
echo "Pronto. Agora ligue o Pi na rede Wi-Fi da ECU (ECU-XXXX, senha da etiqueta) pelo ícone de Wi-Fi."
echo "Ele lembra a rede. Reinicie o Pi: o painel abre sozinho e liga na ECU quando ela aparecer."
