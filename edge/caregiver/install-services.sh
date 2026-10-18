#!/bin/sh
# Make the caregiver Pi start its two programs on boot and restart them if they crash.
#   curl -fsSL https://raw.githubusercontent.com/AnayApte/care-call/main/edge/caregiver/install-services.sh | sh
# Needs ~/caregiver (caregiver.py + .env) and ~/voice (bedside.py + .env) already on the Pi.
# Optional: SPEAKER=<bluetooth address> (default: the team's Sony SRS-XB12).
set -e
SPEAKER="${SPEAKER:-04:21:44:F0:F6:34}"
sudo loginctl enable-linger "$(whoami)"
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/carecall-caregiver.service <<UNIT
[Unit]
Description=Care Call caregiver unit (button, buzzer, light)
After=network-online.target
[Service]
WorkingDirectory=%h/caregiver
ExecStart=/usr/bin/python3 caregiver.py
Restart=always
RestartSec=3
[Install]
WantedBy=default.target
UNIT
cat > ~/.config/systemd/user/carecall-voice.service <<UNIT
[Unit]
Description=Care Call speaker (announces requests, Help is coming)
After=network-online.target pipewire.service wireplumber.service
[Service]
WorkingDirectory=%h/voice
Environment=PLAYER=mpg123
ExecStartPre=-/usr/bin/bluetoothctl connect $SPEAKER
ExecStart=/usr/bin/python3 bedside.py
Restart=always
RestartSec=5
[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now carecall-caregiver carecall-voice
echo "status:"; systemctl --user is-active carecall-caregiver carecall-voice
echo "logs: journalctl --user -u carecall-voice -f   (or carecall-caregiver)"
