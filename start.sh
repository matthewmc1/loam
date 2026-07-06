#!/usr/bin/env bash
# Loam — one-command startup.
#
#   ./start.sh              install deps, start Cadence if available, run Loam → http://localhost:5189
#   ./start.sh --no-cadence just Loam, skip the task-manager integration
#   ./start.sh --preview    production build + preview (:4173) — how to test the offline PWA
#   ./start.sh --token      also mint a fresh Cadence dev API token (automatic when this
#                           script starts Cadence itself — its in-memory backend starts empty)
#   ./start.sh --check      run all setup steps, then exit without launching Loam
#
# Environment:
#   CADENCE_DIR   where the Cadence repo lives          (default: ~/cadence)
#   CADENCE_URL   where the Cadence API answers         (default: http://localhost:8088)
#   LOAM_EMAIL    email for the dev token flow — tokens scope to this account's
#                 board, so use YOUR email (default: git config user.email)
set -euo pipefail
cd "$(dirname "$0")"

CADENCE_DIR="${CADENCE_DIR:-${HOME:-~}/cadence}"
CADENCE_URL="${CADENCE_URL:-http://localhost:8088}"
# Cadence is on by default; WITH_CADENCE=0 or --no-cadence opts out
WITH_CADENCE="${WITH_CADENCE:-1}" MODE=dev MINT=0 CHECK=0
# ${1+"$@"} not "$@": bash < 4.4 under `set -u` reports an empty "$@" as an
# unbound variable, so a flagless `./start.sh` would die on older bashes
for arg in ${1+"$@"}; do
  case "$arg" in
    --no-cadence) WITH_CADENCE=0 ;;
    --preview)    MODE=preview ;;
    --token)      MINT=1 ;;
    --check)      CHECK=1 ;;
    -h|--help)    awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg (try --help)"; exit 1 ;;
  esac
done

say()  { printf '\033[1m[loam]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[loam]\033[0m %s\n' "$*"; }

# server answered anything (even 401) = reachable; connection refused = not
cadence_up() { curl -s -o /dev/null --max-time 2 "$CADENCE_URL/api/v1/bootstrap"; }

# ---------------------------------------------------------------- node + deps
command -v node >/dev/null 2>&1 || { warn "node is required (>= 18) — https://nodejs.org"; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then warn "node >= 18 required (found $(node -v))"; exit 1; fi

if [ ! -d node_modules ]; then
  say "installing dependencies (first run)…"
  npm install
else
  say "dependencies present ✓"
fi

# ------------------------------------------------------------------- cadence
STARTED_CADENCE=0
if [ "$WITH_CADENCE" = 1 ]; then
  if cadence_up; then
    say "Cadence already running at $CADENCE_URL ✓"
  elif [ -d "$CADENCE_DIR/server" ] && command -v go >/dev/null 2>&1; then
    say "starting Cadence from $CADENCE_DIR…"
    CADENCE_LOG="${TMPDIR:-/tmp}/loam-cadence-server.log"
    (cd "$CADENCE_DIR/server" && nohup go run ./cmd/cadence-server >"$CADENCE_LOG" 2>&1 &) || true
    for _ in $(seq 1 40); do cadence_up && break; sleep 0.5; done
    if cadence_up; then
      say "Cadence up at $CADENCE_URL (log: $CADENCE_LOG) ✓"
      STARTED_CADENCE=1
    else
      warn "Cadence didn't come up (log: $CADENCE_LOG) — continuing without it."
      warn "Loam still works fully; tasks you create will queue and sync later."
    fi
  else
    warn "Cadence not found at $CADENCE_DIR (set CADENCE_DIR to change) — continuing without it."
    warn "Loam still works fully; connect Cadence later from the sidebar Tasks ⚙."
  fi
fi

# ------------------------------------------------------- cadence dev token
# Cadence's default backend is in-memory: every restart wipes API tokens. When
# this script just started the server (or --token was passed), mint a fresh
# dev PAT so the user has something to paste — and keep .mcp.json in sync so
# the Claude Code ↔ Cadence MCP keeps working too. The token never touches git
# (.mcp.json is gitignored).
if [ "$WITH_CADENCE" = 1 ] && { [ "$MINT" = 1 ] || [ "$STARTED_CADENCE" = 1 ]; } && cadence_up; then
  # the token scopes to this account's board — default to the developer's own identity
  EMAIL="${LOAM_EMAIL:-$(git config user.email 2>/dev/null || echo loam@example.local)}"
  DEVLINK=$(curl -s -X POST "$CADENCE_URL/api/v1/auth/request" \
      -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("devLink",""))' 2>/dev/null || true)
  if [ -n "$DEVLINK" ]; then
    LOGIN_TOKEN=$(python3 -c 'import sys,urllib.parse as u;print(u.parse_qs(u.urlparse(sys.argv[1]).query)["token"][0])' "$DEVLINK")
    JAR=$(mktemp)
    curl -s -c "$JAR" -X POST "$CADENCE_URL/api/v1/auth/verify" \
      -H 'Content-Type: application/json' -d "{\"token\":\"$LOGIN_TOKEN\"}" >/dev/null
    PAT=$(curl -s -b "$JAR" -X POST "$CADENCE_URL/api/v1/auth/tokens" \
        -H 'Content-Type: application/json' -d '{"name":"loam-start"}' \
      | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null || true)
    rm -f "$JAR"
    if [ -n "$PAT" ]; then
      say "Cadence API token minted:"
      printf '\n    %s\n\n' "$PAT"
      say "→ paste it in Loam: sidebar Tasks ⚙ → API token → Connect"
      CADENCE_URL="$CADENCE_URL" PAT="$PAT" python3 - <<'PY'
import json, os
pat, url = os.environ["PAT"], os.environ["CADENCE_URL"]
src = ".mcp.json" if os.path.exists(".mcp.json") else (".mcp.json.example" if os.path.exists(".mcp.json.example") else None)
if src:
    cfg = json.load(open(src))
    cad = cfg.get("mcpServers", {}).get("cadence", {})
    cad.setdefault("env", {})["CADENCE_API_TOKEN"] = pat
    cad["env"]["CADENCE_API_URL"] = url
    args = cad.get("args", [])
    default_mcp = os.path.expanduser("~/cadence/mcp/dist/index.js")
    if args and not os.path.exists(args[0]) and os.path.exists(default_mcp):
        args[0] = default_mcp
    json.dump(cfg, open(".mcp.json", "w"), indent=2)
    print("[loam] .mcp.json updated for the Cadence MCP (gitignored)")
PY
    else
      warn "couldn't mint a token automatically — mint one in the Cadence app (account → API tokens)"
    fi
  else
    warn "this Cadence isn't in dev mode — mint a token in the Cadence app (account → API tokens)"
  fi
fi

# ---------------------------------------------------------------------- loam
if [ "$CHECK" = 1 ]; then
  say "check complete — everything is ready. Run ./start.sh to launch."
  exit 0
fi

if [ "$MODE" = preview ]; then
  say "building the production bundle (PWA + service worker)…"
  npm run build
  say "preview → http://localhost:4173  (load it once online; after that it works offline)"
  exec npx vite preview --port 4173
else
  say "Loam → http://localhost:5189"
  exec npm run dev
fi
