# Raspberry Pi Device UI Kiosk

These assets install a systemd-managed Kiosk Deployment for the Open Nexus Device UI on Raspberry Pi OS. The service launches Chromium fullscreen and passes the configured Brain Server URLs to the Device UI.

## Install

From a checkout of this repo on the Raspberry Pi:

```sh
cd deploy/device-ui/raspberry-pi
sudo ./install.sh
```

The installer:

- installs Chromium, `python3`, and `unclutter`;
- copies the launcher to `/usr/local/bin/open-nexus-device-ui-kiosk`;
- copies the systemd template to `/etc/systemd/system/open-nexus-device-ui@.service`;
- creates `/etc/open-nexus/device-ui-kiosk.env` from `device-ui-kiosk.env.example` when it does not already exist;
- enables the service for `KIOSK_USER`.

## Configure

Edit `/etc/open-nexus/device-ui-kiosk.env`:

```sh
sudo nano /etc/open-nexus/device-ui-kiosk.env
```

Required settings:

- `KIOSK_USER`: Linux user that owns the graphical session, commonly `pi`.
- `DEVICE_UI_URL`: Device UI URL served on or reachable from the Raspberry Pi.
- `BRAIN_HTTP_URL`: Brain Server HTTP URL reachable from the Raspberry Pi.
- `BRAIN_WS_URL`: Brain Server WebSocket URL reachable from the Raspberry Pi.
- `CHROMIUM_BINARY`: Chromium command name, commonly `chromium-browser` or `chromium`.
- `KIOSK_DISPLAY`: X11 display for the graphical session, commonly `:0`.

When the Device UI and Brain Server run on another machine, use that machine's local network address instead of `127.0.0.1`.

## Start and Stop

Start the kiosk:

```sh
sudo systemctl start open-nexus-device-ui@pi.service
```

Stop it:

```sh
sudo systemctl stop open-nexus-device-ui@pi.service
```

Restart after config changes:

```sh
sudo systemctl restart open-nexus-device-ui@pi.service
```

Check status:

```sh
systemctl status open-nexus-device-ui@pi.service
```

## Update

After pulling repo changes on the Raspberry Pi, rerun the installer:

```sh
cd deploy/device-ui/raspberry-pi
sudo ./install.sh
sudo systemctl restart open-nexus-device-ui@pi.service
```

The installer preserves an existing `/etc/open-nexus/device-ui-kiosk.env`.

## Troubleshooting

View service logs:

```sh
journalctl -u open-nexus-device-ui@pi.service -f
```

If Chromium does not open, confirm `CHROMIUM_BINARY` matches the installed command:

```sh
command -v chromium-browser || command -v chromium
```

If the Device UI loads but cannot reach the Brain Server, open the configured `BRAIN_HTTP_URL` from the Raspberry Pi and check that the Brain Server is listening on the local network rather than only `127.0.0.1`.

If the service starts before the desktop session is ready, confirm the Raspberry Pi boots to a graphical desktop and that `KIOSK_DISPLAY` matches the active display.
