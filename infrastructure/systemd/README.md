# Monitoring and alerting units (staging host)

`staging.sh monitor` exits 1 and prints `ALERT ...` lines when something is
wrong. These units run it every 5 minutes and deliver a failure to a real
channel (`alert.sh`). Without a delivered test message the alerting is
**not** accepted (see docs/deployment/staging-acceptance.md, check M-3).

```bash
# 1. Operator account that may use Docker (adjust User= in the units if you use another)
sudo useradd --system --create-home --groups docker bos-ops

# 2. Alert channel (a decision of the IT lead; the URL is a secret)
sudo install -d -m 755 /etc/bissinger-staging
sudo install -m 600 -o bos-ops /dev/null /etc/bissinger-staging/alert.env
echo 'ALERT_WEBHOOK_URL=https://ntfy.example/bos-staging-alerts' | sudo tee -a /etc/bissinger-staging/alert.env >/dev/null
#   optional: ALERT_FORMAT=json  (Slack/Mattermost/Teams-style {"text": ...})

# 3. Install and start
sudo cp infrastructure/systemd/bos-monitor.service infrastructure/systemd/bos-monitor.timer \
        'infrastructure/systemd/bos-alert@.service' /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bos-monitor.timer

# 4. Prove delivery (must arrive at the channel) and the failure path
sudo -u bos-ops infrastructure/scripts/staging.sh alert-test
sudo systemctl start 'bos-alert@bos-monitor.service'   # sends the last journal lines
```

Alerts repeat on every failing run (every 5 minutes) until the cause is fixed.
There is no recovery message; that is a known limitation.
