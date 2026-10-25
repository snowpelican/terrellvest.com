#!/usr/bin/env bash
# Serve the prebuilt _dist/ folder on all interfaces and print the Tailscale URL.
# Usage: ./serve.sh [port]   (default 8080)
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8080}"

IP="$(tailscale ip -4 2>/dev/null | head -n1 || true)"
DNS="$(tailscale status --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null || true)"

echo "Serving _dist/ on port $PORT"
[ -n "$DNS" ] && echo "  Tailscale:  http://$DNS:$PORT/"
[ -n "$IP" ]  && echo "  Tailscale:  http://$IP:$PORT/"
[ -n "$IP" ]  && echo "  Photography: http://$IP:$PORT/photography/"
[ -z "$IP$DNS" ] && echo "  (tailscale not detected; use this machine's LAN IP)"

exec python3 -m http.server "$PORT" --bind 0.0.0.0 --directory _dist
