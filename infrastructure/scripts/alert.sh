#!/usr/bin/env bash
# Delivers one alert message to the configured channel. Used by the systemd
# unit bos-alert@.service when bos-monitor fails, and by `staging.sh alert-test`.
#
#   alert.sh <unit-name>     message = last lines of that unit's journal
#   alert.sh --test          sends a test message (proves the channel works)
#
# Channel: HTTP POST to ALERT_WEBHOOK_URL (secret, from /etc/bissinger-staging/alert.env,
# mode 600). ALERT_FORMAT=text (default, e.g. ntfy) sends the message as the body;
# ALERT_FORMAT=json sends {"text": "..."} (Slack/Mattermost/Teams-compatible).
# The message contains check names only (container states, ages, percentages):
# no customer data, no secrets. Exit code 0 only if the channel answered 2xx.
set -euo pipefail

ENV_FILE="${ALERT_ENV_FILE:-/etc/bissinger-staging/alert.env}"
[ -r "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
: "${ALERT_WEBHOOK_URL:?ALERT_WEBHOOK_URL is not set (see infrastructure/systemd/README.md)}"

host="$(hostname | cut -d. -f1)"
if [ "${1:-}" = "--test" ]; then
  body="[bissinger-os staging @ ${host}] TEST alert: if you read this, alert delivery works ($(date -u +%FT%TZ))"
else
  unit="${1:?usage: alert.sh <unit> | --test}"
  lines="$(journalctl -u "${unit%.service}" -n 15 --no-pager -o cat 2>/dev/null | grep -E 'ALERT|error' | tail -10 || true)"
  body="[bissinger-os staging @ ${host}] ALERT from ${unit}:
${lines:-no details in the journal}"
fi

if [ "${ALERT_FORMAT:-text}" = json ]; then
  payload="$(printf '%s\n' "$body" | awk '
    BEGIN { printf "{\"text\":\"" }
    { gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); gsub(/\t/, "\\t"); printf "%s%s", (NR > 1 ? "\\n" : ""), $0 }
    END { printf "\"}" }')"
  curl -fsS -m 15 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null
else
  curl -fsS -m 15 -d "$body" "$ALERT_WEBHOOK_URL" >/dev/null
fi
echo "alert delivered"
