#!/usr/bin/env bash
# Read-only audit of one Hermes session's token accounting, for comparing
# Hermes's own numbers against what the Latitude plugin exported.
#
#   ./usage-audit.sh                        # list recent sessions, audit the newest
#   ./usage-audit.sh <session-id>           # audit one session
#   ./usage-audit.sh <session-id> --profile alescriptslack
#
# Touches nothing: opens Hermes's SQLite state read-only, greps the rotating
# logs, and reads config.yaml. It never runs the agent and never writes.
#
# Why the three sources disagree — and which one to trust for what:
#
#   /usage            `agent.session_*` counters, live on the Agent OBJECT.
#                     `init_agent` zeroes them, and the CLI rebuilds the agent
#                     whenever the turn route changes (model, provider,
#                     requested_provider, base_url, api_mode, command, args) —
#                     so a /model switch, a credential rotation or a provider
#                     fallback restarts them mid-session.
#   state.db          `sessions` + `session_model_usage`, keyed by SESSION id
#                     and therefore immune to that reset. `task = ''` is the
#                     main agent loop; any other `task` is an auxiliary call
#                     (compression, vision, web_extract, session_search, MoA,
#                     background review) that the main loop never counts.
#   Latitude          one `llm_request` span per `pre_api_request`, usage
#                     attached when `post_api_request` fires.
#
# The DB is written by a background flusher, so a live session's numbers settle
# a moment after each turn. Run this after the turn finishes.

set -euo pipefail

SESSION_ID="${1:-}"
[[ "${SESSION_ID}" == --* ]] && SESSION_ID=""
PROFILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --profile=*) PROFILE="${1#*=}"; shift ;;
    *) shift ;;
  esac
done

# ── locate the Hermes home, honouring HERMES_HOME and --profile ──────────────
if [[ -n "${PROFILE}" && "${PROFILE}" != "default" ]]; then
  HOME_DIR="${HOME}/.hermes/profiles/${PROFILE}"
else
  HOME_DIR="${HERMES_HOME:-${HOME}/.hermes}"
fi
DB="${HOME_DIR}/state.db"
LOG_DIR="${HOME_DIR}/logs"
VENV_PY="${HOME}/.hermes/hermes-agent/venv/bin/python"
PY="${VENV_PY}"; [[ -x "${PY}" ]] || PY="$(command -v python3)"

echo "════════ hermes usage audit ════════"
echo "hermes home : ${HOME_DIR}"
echo "state db    : ${DB}$([[ -f "${DB}" ]] || echo '  (MISSING)')"
echo "logs        : ${LOG_DIR}"
echo "python      : ${PY}"

# ── 1. environment ───────────────────────────────────────────────────────────
echo
echo "──── 1. environment ────"
"${PY}" - <<'PY' 2>/dev/null || echo "hermes_cli not importable from this python"
try:
    import hermes_cli
    print(f"hermes-agent     : {hermes_cli.__version__}")
except Exception as exc:
    print(f"hermes-agent     : unavailable ({exc})")
try:
    import latitude_telemetry_hermes as p
    from latitude_telemetry_hermes.config import PKG_VERSION
    print(f"latitude plugin  : {PKG_VERSION}  ({p.__file__})")
except Exception as exc:
    print(f"latitude plugin  : NOT INSTALLED in this python ({exc})")
PY

CFG="${HOME_DIR}/config.yaml"
if [[ -f "${CFG}" ]]; then
  echo "plugin enabled   : $(grep -qE '^\s*-\s*latitude\s*$' "${CFG}" && echo yes || echo 'NOT FOUND in config.yaml')"
  echo "logging level    : $(grep -A3 -E '^\s*logging:' "${CFG}" | grep -E 'level' || echo 'default (INFO)')"
fi
for v in LATITUDE_API_KEY LATITUDE_PROJECT LATITUDE_BASE_URL LATITUDE_DEBUG LATITUDE_NO_CONTENT; do
  raw="${!v:-}"
  if [[ -z "${raw}" && -f "${HOME_DIR}/.env" ]]; then
    raw="$(grep -E "^${v}=" "${HOME_DIR}/.env" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  fi
  if [[ -n "${raw}" ]]; then
    [[ "${v}" == "LATITUDE_API_KEY" ]] && raw="${raw:0:8}…(${#raw} chars)"
    printf '%-17s: %s\n' "${v}" "${raw}"
  else
    printf '%-17s: (unset)\n' "${v}"
  fi
done

[[ -f "${DB}" ]] || { echo; echo "No state.db — nothing further to audit."; exit 0; }

# ── 2. recent sessions ───────────────────────────────────────────────────────
echo
echo "──── 2. recent sessions (newest first) ────"
"${PY}" - "${DB}" <<'PY'
import sqlite3, sys, datetime
db = sys.argv[1]
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
c.row_factory = sqlite3.Row
rows = c.execute("""
  SELECT id, started_at, ended_at, source, profile_name, model, api_call_count,
         message_count, tool_call_count, input_tokens, output_tokens,
         cache_read_tokens, reasoning_tokens, billing_mode, cost_status,
         estimated_cost_usd
    FROM sessions ORDER BY started_at DESC LIMIT 10""").fetchall()
ts = lambda v: datetime.datetime.fromtimestamp(v).strftime("%m-%d %H:%M") if v else "—"
print(f"{'session id':<34} {'started':<12} {'src':<8} {'calls':>6} {'msgs':>5} {'in':>9} {'out':>7} {'cache':>11}")
for r in rows:
    print(f"{r['id']:<34} {ts(r['started_at']):<12} {(r['source'] or ''):<8} "
          f"{r['api_call_count'] or 0:>6} {r['message_count'] or 0:>5} "
          f"{r['input_tokens'] or 0:>9,} {r['output_tokens'] or 0:>7,} {r['cache_read_tokens'] or 0:>11,}")
PY

if [[ -z "${SESSION_ID}" ]]; then
  SESSION_ID="$("${PY}" - "${DB}" <<'PY'
import sqlite3, sys
c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
row = c.execute("SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1").fetchone()
print(row[0] if row else "")
PY
)"
  echo
  echo "(no session id given — auditing the newest: ${SESSION_ID})"
fi
[[ -n "${SESSION_ID}" ]] || { echo "No sessions found."; exit 0; }

# ── 3. the authoritative per-session accounting ──────────────────────────────
echo
echo "──── 3. state.db accounting for ${SESSION_ID} ────"
"${PY}" - "${DB}" "${SESSION_ID}" <<'PY'
import sqlite3, sys, datetime
db, sid = sys.argv[1], sys.argv[2]
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True); c.row_factory = sqlite3.Row

row = c.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
if row is None:
    hit = c.execute("SELECT id FROM sessions WHERE id LIKE ? LIMIT 2", (sid + "%",)).fetchall()
    print(f"session {sid!r} not found" + (f"; did you mean {hit[0][0]}?" if len(hit) == 1 else ""))
    raise SystemExit(0)

k = dict(row)
dur = (k.get("ended_at") or k.get("last_activity_at") or 0) - (k.get("started_at") or 0)
print("── sessions row (cumulative, survives agent rebuilds) ──")
for label, key in (
    ("api calls", "api_call_count"), ("messages", "message_count"),
    ("tool calls", "tool_call_count"), ("input tokens", "input_tokens"),
    ("output tokens", "output_tokens"), ("cache read", "cache_read_tokens"),
    ("cache write", "cache_write_tokens"), ("reasoning", "reasoning_tokens"),
):
    print(f"  {label:<15}: {k.get(key) or 0:>12,}")
print(f"  {'input+cache':<15}: {(k.get('input_tokens') or 0) + (k.get('cache_read_tokens') or 0) + (k.get('cache_write_tokens') or 0):>12,}   <- compare to /usage 'Prompt tokens (total)'")
print(f"  {'duration':<15}: {dur/60:>12.1f} min")
for label, key in (("model", "model"), ("profile", "profile_name"), ("source", "source"),
                   ("billing mode", "billing_mode"), ("cost status", "cost_status"),
                   ("cost source", "cost_source")):
    print(f"  {label:<15}: {k.get(key)}")
print(f"  {'est cost usd':<15}: {k.get('estimated_cost_usd')}")
print(f"  {'actual cost usd':<15}: {k.get('actual_cost_usd')}")

print()
print("── session_model_usage by task  (task='' is the MAIN LOOP; others are auxiliary) ──")
rows = c.execute("""
  SELECT task, model, billing_provider, billing_mode, api_call_count,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         reasoning_tokens, cost_status, estimated_cost_usd, actual_cost_usd
    FROM session_model_usage WHERE session_id = ?
   ORDER BY (task <> ''), api_call_count DESC""", (sid,)).fetchall()
if not rows:
    print("  (no rows — the background flusher may not have written yet)")
tot = {}
for r in rows:
    task = r["task"] or "(main loop)"
    print(f"  {task:<22} {r['model']:<16} {r['billing_mode'] or '-':<24} "
          f"calls={r['api_call_count']:>5} in={r['input_tokens']:>9,} out={r['output_tokens']:>7,} "
          f"cache={r['cache_read_tokens']:>11,} reas={r['reasoning_tokens']:>7,} "
          f"cost={r['cost_status'] or '-'}/{r['estimated_cost_usd'] or 0:.4f}")
    for key in ("api_call_count", "input_tokens", "output_tokens", "cache_read_tokens",
                "cache_write_tokens", "reasoning_tokens"):
        tot[key] = tot.get(key, 0) + (r[key] or 0)
main = [r for r in rows if not r["task"]]
aux = [r for r in rows if r["task"]]
print()
print(f"  main-loop calls : {sum(r['api_call_count'] for r in main):>6}    <- what /usage should show")
print(f"  auxiliary calls : {sum(r['api_call_count'] for r in aux):>6}    <- invisible to /usage")
print(f"  all calls       : {tot.get('api_call_count', 0):>6}    <- compare to Latitude's chat-span count")
print(f"  all tokens in   : {tot.get('input_tokens', 0):>12,}")
print(f"  all tokens out  : {tot.get('output_tokens', 0):>12,}  (INCLUDES reasoning: {tot.get('reasoning_tokens', 0):,})")
print(f"  all cache read  : {tot.get('cache_read_tokens', 0):>12,}")
PY

# ── 4. log-derived: the API-call sequence, and whether it restarted ──────────
echo
echo "──── 4. agent.log: 'API call #N' sequence for this session ────"
if compgen -G "${LOG_DIR}/agent.log*" > /dev/null; then
  # The line prints agent.session_api_calls, so a RESTART of the numbering is a
  # direct fingerprint of the Agent object being rebuilt mid-session.
  grep -h "\[${SESSION_ID}\]" "${LOG_DIR}"/agent.log* 2>/dev/null \
    | grep -o "API call #[0-9]*" | grep -o "[0-9]*" > /tmp/hermes-audit-seq.txt || true
  n=$(wc -l < /tmp/hermes-audit-seq.txt | tr -d ' ')
  echo "  logged API calls          : ${n}"
  if [[ "${n}" != "0" ]]; then
    echo "  highest counter reached   : $(sort -n /tmp/hermes-audit-seq.txt | tail -1)"
    echo "  counter restarts detected : $(awk 'NR>1 && $1<=prev {c++} {prev=$1} END {print c+0}' /tmp/hermes-audit-seq.txt)"
    echo "    (any restart > 0 means the Agent was rebuilt and /usage lost the earlier calls)"
    echo "  first/last lines:"
    grep -h "\[${SESSION_ID}\]" "${LOG_DIR}"/agent.log* 2>/dev/null | grep "API call #" | head -2 | sed 's/^/    /'
    grep -h "\[${SESSION_ID}\]" "${LOG_DIR}"/agent.log* 2>/dev/null | grep "API call #" | tail -2 | sed 's/^/    /'
  else
    echo "  (none — logs rotate at 5 MB x 3 backups, so an old session may have aged out)"
  fi
  echo
  echo "  fallback / route-change markers for this session:"
  echo "    matches: $(grep -h "\[${SESSION_ID}\]" "${LOG_DIR}"/agent.log* 2>/dev/null | grep -icE "fallback|rotat|switching (model|provider)|credential" | tr -d ' ')"
  echo
  echo "──── 5. plugin export log (needs LATITUDE_DEBUG=1) ────"
  echo "  'Latitude tracing' lines  : $(grep -h "Latitude tracing" "${LOG_DIR}"/agent.log* 2>/dev/null | wc -l | tr -d ' ')"
  grep -h "Latitude tracing: ingest" "${LOG_DIR}"/agent.log* 2>/dev/null | grep -o "HTTP [0-9]*" | sort | uniq -c | sed 's/^/    /' || echo "    (no ingest lines — set LATITUDE_DEBUG=1 to record them)"
  grep -h "Latitude tracing: ingest failed" "${LOG_DIR}"/agent.log* 2>/dev/null | tail -3 | sed 's/^/    FAILED: /' || true
else
  echo "  no ${LOG_DIR}/agent.log* found"
fi

echo
echo "──── paste this back ────"
echo "session: ${SESSION_ID}"
echo "Also run /usage inside that same session and include its output, so the three"
echo "sources (agent counters, state.db, Latitude spans) can be lined up."
