#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="/etc/open-nexus/device-ui-kiosk.env"
service_template="/etc/systemd/system/open-nexus-device-ui@.service"
launcher="/usr/local/bin/open-nexus-device-ui-kiosk"

install -d -m 0755 /etc/open-nexus
install -m 0755 "$script_dir/open-nexus-device-ui-kiosk" "$launcher"
install -m 0644 "$script_dir/open-nexus-device-ui.service" "$service_template"

if [[ ! -f "$env_file" ]]; then
  install -m 0644 "$script_dir/device-ui-kiosk.env.example" "$env_file"
fi

apt-get update
apt-get install -y --no-install-recommends python3 unclutter
if ! apt-get install -y --no-install-recommends chromium-browser; then
  apt-get install -y --no-install-recommends chromium
  if grep -q "^CHROMIUM_BINARY=chromium-browser$" "$env_file"; then
    sed -i "s/^CHROMIUM_BINARY=chromium-browser$/CHROMIUM_BINARY=chromium/" "$env_file"
  fi
fi

kiosk_user="$(awk -F= '/^KIOSK_USER=/{print $2}' "$env_file" | tail -n 1)"
kiosk_user="${kiosk_user:-pi}"

systemctl daemon-reload
systemctl enable "open-nexus-device-ui@${kiosk_user}.service"

cat <<EOF
Open Nexus Device UI kiosk assets installed.

Next steps:
1. Edit $env_file for this Raspberry Pi and Brain Server.
2. Start the kiosk with:
   sudo systemctl start open-nexus-device-ui@${kiosk_user}.service
EOF
