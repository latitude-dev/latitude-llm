#!/usr/bin/env bash
# mini-shai-hulud.sh
#
# Auditor for the May 2026 "Mini Shai-Hulud" npm + PyPI supply-chain campaign.
# Writeup: https://socket.dev/blog/tanstack-npm-packages-compromised-mini-shai-hulud-supply-chain-attack
#
# Downloads the live CSV of compromised package versions from Socket and
# checks every pnpm/npm and Python (uv/pip) manifest + lockfile in the repo
# for matches. Also checks for the campaign's hard-coded indicators of
# compromise: the malicious git ref the worm uses, payload filenames it
# drops on disk, attacker exfil domains, and IDE persistence files.
#
# Re-run any time — the CSV is fetched fresh by default. To audit offline or
# pin a specific snapshot, pass `--csv path/to/list.csv` or `--url ...`.
#
# CSV format (header required; columns after Version are ignored):
#   Ecosystem,Namespace,Name,Version,Published,Detected
#   npm,@tanstack,react-router,1.169.8,...,...
#   pypi,,mistralai,2.4.6,...,...
#   npm,,cross-stitch,1.1.7,...,...
#
# Supported ecosystems: npm, pypi. Others are skipped with a warning.
#
# Usage:   ./scripts/audit/mini-shai-hulud.sh [--csv path | --url url] [repo-root]
# Exit:    0 = clean, 1 = compromise indicators found, 2 = usage error

set -u

CSV_URL_DEFAULT="https://socket.dev/3ecd9cbf-a72b-41cb-a2c9-02e367128876"
CSV_URL="$CSV_URL_DEFAULT"
CSV_PATH=""
ROOT="."

while [ $# -gt 0 ]; do
  case "$1" in
    --csv)        CSV_PATH="$2"; shift 2 ;;
    --csv=*)      CSV_PATH="${1#--csv=}"; shift ;;
    --url)        CSV_URL="$2"; shift 2 ;;
    --url=*)      CSV_URL="${1#--url=}"; shift ;;
    -h|--help)    sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --)           shift; break ;;
    -*)           echo "Unknown flag: $1" >&2; exit 2 ;;
    *)            ROOT="$1"; shift ;;
  esac
done

cd "$ROOT" 2>/dev/null || { echo "Cannot cd to $ROOT" >&2; exit 2; }

if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BOLD=""; DIM=""; RESET=""
fi

ok()   { echo "${GREEN}✓${RESET} $*"; }
warn() { echo "${YELLOW}!${RESET} $*"; }
fail() { echo "${RED}✗${RESET} $*"; }
hdr()  { echo; echo "${BOLD}== $* ==${RESET}"; }

FAILED=0
WARNED=0

# ---- Campaign-specific indicators of compromise -----------------------------
# Source: socket.dev TanStack / Mini Shai-Hulud writeup (May 2026)
BAD_GIT_REF="79ac49eedf774dd4b0cfa308722bc463cfe5885c"
FAKE_NPM_PKG="@tanstack/setup"
PAYLOAD_FILES=("router_init.js" "router_runtime.js" "tanstack_runner.js" "transformers.pyz")
BAD_DOMAINS=("git-tanstack.com" "filev2.getsession.org")

# ---- Build per-ecosystem compromised lists from CSV --------------------------
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
NPM_LIST="$TMP_DIR/npm.txt"
PYPI_LIST="$TMP_DIR/pypi.txt"
SKIPPED_LIST="$TMP_DIR/skipped.txt"
: > "$NPM_LIST"; : > "$PYPI_LIST"; : > "$SKIPPED_LIST"

# If no local CSV was supplied, try to download the live list.
CSV_SOURCE=""
if [ -z "$CSV_PATH" ]; then
  CSV_PATH="$TMP_DIR/compromised.csv"
  CSV_SOURCE="$CSV_URL"
  if command -v curl >/dev/null 2>&1; then
    curl -sL -A "Mozilla/5.0" -H "Accept: text/csv,*/*" --max-time 30 \
      -o "$CSV_PATH" "$CSV_URL" || true
  elif command -v wget >/dev/null 2>&1; then
    wget -q --timeout=30 --user-agent="Mozilla/5.0" -O "$CSV_PATH" "$CSV_URL" || true
  else
    echo "Neither curl nor wget found; pass --csv with a local file" >&2
    exit 2
  fi
else
  [ -f "$CSV_PATH" ] || { echo "CSV not found: $CSV_PATH" >&2; exit 2; }
  CSV_SOURCE="$CSV_PATH"
fi

# Validate the CSV header so we fail loudly if the URL ever returns HTML
# (Socket.dev gates the share link behind a Cloudflare bot challenge that
# curl can't solve) or the format ever changes.
first_line=$(head -n1 "$CSV_PATH" 2>/dev/null || true)
case "$first_line" in
  Ecosystem,Namespace,Name,Version*) : ;;
  "<!DOCTYPE"*|"<html"*|"")
    echo "Failed to fetch a CSV from $CSV_URL." >&2
    echo "The endpoint returned an HTML page (likely a Cloudflare bot challenge)." >&2
    echo "Open the URL in a browser, save the CSV locally, and re-run with:" >&2
    echo "    $0 --csv path/to/compromised.csv" >&2
    exit 2
    ;;
  *)
    echo "Unexpected CSV header: '${first_line}'" >&2
    echo "Expected: Ecosystem,Namespace,Name,Version,..." >&2
    exit 2
    ;;
esac

# PyPI names: PEP 503 normalization (lowercase, runs of -/_/. collapsed to -).
awk -F, '
  NR == 1 { next }                       # header
  NF < 4  { next }
  {
    eco=$1; ns=$2; name=$3; ver=$4
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", eco)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", ns)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", ver)
    if (eco == "npm") {
      full = (ns == "") ? name : ns "/" name
      print full "|" ver > npm_out
    } else if (eco == "pypi") {
      lname = tolower(name)
      gsub(/[._-]+/, "-", lname)
      print lname "|" ver > pypi_out
    } else if (eco != "") {
      print eco "/" name "@" ver > skipped_out
    }
  }
' npm_out="$NPM_LIST" pypi_out="$PYPI_LIST" skipped_out="$SKIPPED_LIST" \
  "$CSV_PATH"

sort -u -o "$NPM_LIST" "$NPM_LIST"
sort -u -o "$PYPI_LIST" "$PYPI_LIST"
sort -u -o "$SKIPPED_LIST" "$SKIPPED_LIST"

NPM_COUNT=$(wc -l < "$NPM_LIST" | tr -d ' ')
PYPI_COUNT=$(wc -l < "$PYPI_LIST" | tr -d ' ')
SKIPPED_COUNT=$(wc -l < "$SKIPPED_LIST" | tr -d ' ')

echo "${BOLD}Supply-chain audit${RESET}"
echo "${DIM}Repo:  $(pwd)${RESET}"
echo "${DIM}CSV:   $CSV_SOURCE${RESET}"
echo "${DIM}List:  $NPM_COUNT npm + $PYPI_COUNT pypi compromised entries (+ $SKIPPED_COUNT skipped)${RESET}"

if [ "$SKIPPED_COUNT" -gt 0 ]; then
  warn "Skipped $SKIPPED_COUNT entries from unsupported ecosystems (composer, etc.):"
  sed 's/^/    /' "$SKIPPED_LIST"
  WARNED=$((WARNED+1))
fi

# Match helpers — `name|version` lookup via fixed-string grep
is_bad_npm()  { grep -qxF "$1|$2" "$NPM_LIST"; }
is_bad_pypi() {
  local n="$1" v="$2"
  n="$(printf '%s' "$n" | tr '[:upper:]' '[:lower:]' | sed -E 's/[._-]+/-/g')"
  grep -qxF "$n|$v" "$PYPI_LIST"
}

# ---- 1. Lockfile indicators of compromise (git ref / fake pkg) --------------
hdr "1. Lockfile indicators of compromise"

LOCKFILES=()
[ -f pnpm-lock.yaml ]    && LOCKFILES+=("pnpm-lock.yaml")
[ -f package-lock.json ] && LOCKFILES+=("package-lock.json")
[ -f yarn.lock ]         && LOCKFILES+=("yarn.lock")
[ -f bun.lockb ]         && LOCKFILES+=("bun.lockb")

LOCK_HITS=0
if [ ${#LOCKFILES[@]} -eq 0 ]; then
  warn "No JS lockfile found at $ROOT — are you at the repo root?"
  WARNED=$((WARNED+1))
else
  echo "${DIM}Lockfiles: ${LOCKFILES[*]}${RESET}"
  for lf in "${LOCKFILES[@]}"; do
    if grep -q "$BAD_GIT_REF" "$lf" 2>/dev/null; then
      fail "$lf contains the malicious git ref ($BAD_GIT_REF)"
      LOCK_HITS=$((LOCK_HITS+1))
    fi
    if grep -q "$FAKE_NPM_PKG" "$lf" 2>/dev/null; then
      fail "$lf references the fake package $FAKE_NPM_PKG"
      LOCK_HITS=$((LOCK_HITS+1))
    fi
  done
  if [ "$LOCK_HITS" -eq 0 ]; then
    ok "No malicious git ref or fake-package references in lockfiles"
  else
    FAILED=$((FAILED+LOCK_HITS))
  fi
fi

# ---- 2. Payload files on disk -----------------------------------------------
hdr "2. Payload files on disk"

PAYLOAD_HITS=0
for pf in "${PAYLOAD_FILES[@]}"; do
  hits=$(find . -name "$pf" \
    -not -path "*/.git/*" \
    -not -path "*/node_modules/*" \
    -not -path "*/.venv/*" \
    -not -path "*/site-packages/*" \
    -not -path "*/.next/*" \
    -not -path "*/.turbo/*" \
    -not -path "*/.output/*" \
    2>/dev/null)
  if [ -n "$hits" ]; then
    fail "Found $pf on disk:"
    echo "$hits" | sed 's/^/    /'
    PAYLOAD_HITS=$((PAYLOAD_HITS+1))
  fi
done

for p in "/tmp/transformers.pyz"; do
  [ -e "$p" ] && { fail "$p present (payload staging path)"; PAYLOAD_HITS=$((PAYLOAD_HITS+1)); }
done

if [ "$PAYLOAD_HITS" -eq 0 ]; then
  ok "No known payload artifacts on disk"
else
  FAILED=$((FAILED+PAYLOAD_HITS))
fi

# ---- 3. npm: pnpm-lock.yaml resolved package versions -----------------------
hdr "3. npm: pnpm-lock.yaml resolved versions"

PNPM_HITS=0
if [ -f pnpm-lock.yaml ]; then
  # Extract `name|version` from top-level package keys in `packages:`.
  # Keys look like:  '@scope/name@1.2.3':       or  'pkg@1.2.3(peer@x)':
  # The regex captures up to the first `(`, `:`, `'`, or `"` after the
  # version, which drops the peer-dep tail.
  PNPM_PAIRS="$TMP_DIR/pnpm_pairs.txt"
  sed -nE "s/^[[:space:]]+'?(@?[a-zA-Z0-9_./\\-]+)@([0-9][^()'\"]*)('|\\(|:).*$/\\1|\\2/p" \
    pnpm-lock.yaml | sort -u > "$PNPM_PAIRS"

  while IFS='|' read -r pkg ver; do
    [ -z "$pkg" ] && continue
    if is_bad_npm "$pkg" "$ver"; then
      fail "pnpm-lock.yaml resolves $pkg@$ver (MALICIOUS)"
      PNPM_HITS=$((PNPM_HITS+1))
    fi
  done < "$PNPM_PAIRS"

  if [ "$PNPM_HITS" -eq 0 ]; then
    ok "No malicious npm versions resolved in pnpm-lock.yaml"
  else
    FAILED=$((FAILED+PNPM_HITS))
  fi
else
  echo "${DIM}No pnpm-lock.yaml at $ROOT${RESET}"
fi

# ---- 4. npm: pinned versions in package.json (all workspaces) + catalog ----
hdr "4. npm: package.json pinned versions (all workspaces)"

PJSONS=$(find . -name package.json \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/.next/*" \
  -not -path "*/.turbo/*" \
  -not -path "*/.output/*" \
  2>/dev/null)

PIN_HITS=0
for pj in $PJSONS; do
  while IFS= read -r line; do
    pkg=$(printf '%s' "$line" | sed -E 's/.*"([^"]+)"[[:space:]]*:[[:space:]]*"[^"]+".*/\1/')
    ver=$(printf '%s' "$line" | sed -E 's/.*"[^"]+"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
    case "$ver" in
      catalog:*|workspace:*|file:*|link:*|git+*|http*|npm:*|"*"|""|"latest") continue ;;
    esac
    cleaned=$(printf '%s' "$ver" | sed -E 's/^[\^~>=<]+//; s/[[:space:]].*//')
    case "$cleaned" in
      [0-9]*) : ;;
      *)      continue ;;
    esac
    if is_bad_npm "$pkg" "$cleaned"; then
      fail "$pj pins $pkg to $ver (MALICIOUS — bump or remove)"
      PIN_HITS=$((PIN_HITS+1))
    fi
  done < <(grep -E '"[@a-zA-Z0-9_./\-]+"[[:space:]]*:[[:space:]]*"[^"]+"' "$pj" 2>/dev/null)
done

# pnpm-workspace.yaml catalog block (bare YAML values, BSD-awk compatible)
if [ -f pnpm-workspace.yaml ]; then
  CATALOG_PAIRS="$TMP_DIR/catalog.txt"
  awk '
    /^catalog[s]?:[[:space:]]*$/  { in_cat=1; next }
    in_cat && /^[^[:space:]#]/     { in_cat=0 }
    in_cat {
      line=$0
      sub(/#.*$/, "", line)
      sub(/^[[:space:]]+/, "", line)
      if (line == "") next
      gsub(/"/, "", line)            # strip double quotes
      gsub(/\047/, "", line)         # strip single quotes
      pos = index(line, ":")
      if (pos == 0) next
      name = substr(line, 1, pos - 1)
      ver  = substr(line, pos + 1)
      gsub(/[[:space:]]/, "", name)
      gsub(/[[:space:]]/, "", ver)
      if (name != "" && ver != "") print name "|" ver
    }
  ' pnpm-workspace.yaml > "$CATALOG_PAIRS" 2>/dev/null || true

  while IFS='|' read -r pkg ver; do
    [ -z "$pkg" ] && continue
    cleaned=$(printf '%s' "$ver" | sed -E 's/^[\^~>=<]+//')
    if is_bad_npm "$pkg" "$cleaned"; then
      fail "pnpm-workspace.yaml catalog pins $pkg to $ver (MALICIOUS)"
      PIN_HITS=$((PIN_HITS+1))
    fi
  done < "$CATALOG_PAIRS"
fi

if [ "$PIN_HITS" -eq 0 ]; then
  ok "No package.json / catalog pins to malicious versions"
else
  FAILED=$((FAILED+PIN_HITS))
fi

# ---- 5. npm: installed versions in node_modules (if present) ---------------
hdr "5. npm: installed node_modules versions"

INSTALLED_HITS=0
INSTALLED_COUNT=0

scan_pj() {
  local pj name ver
  pj="$1"
  name=$(grep -m1 '"name"' "$pj" | sed -E 's/.*"name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
  ver=$(grep -m1 '"version"' "$pj" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
  [ -z "$name" ] || [ -z "$ver" ] && return
  INSTALLED_COUNT=$((INSTALLED_COUNT+1))
  if is_bad_npm "$name" "$ver"; then
    fail "node_modules has $name@$ver installed (MALICIOUS)"
    echo "    $pj"
    INSTALLED_HITS=$((INSTALLED_HITS+1))
  fi
}

if [ -d node_modules ]; then
  while IFS= read -r pj; do scan_pj "$pj"; done < <(
    find node_modules -maxdepth 4 -name package.json \
      -not -path "*/node_modules/.bin/*" 2>/dev/null
  )
fi

if [ "$INSTALLED_COUNT" -eq 0 ]; then
  echo "${DIM}No installed node_modules packages scanned (run pnpm install to enable this check)${RESET}"
elif [ "$INSTALLED_HITS" -eq 0 ]; then
  ok "No malicious versions among $INSTALLED_COUNT installed node_modules entries"
else
  FAILED=$((FAILED+INSTALLED_HITS))
fi

# ---- 6. pypi: lockfile entries (uv.lock / poetry.lock / Pipfile.lock) ------
hdr "6. pypi: lockfile entries (uv.lock / poetry.lock / Pipfile.lock)"

PY_LOCKS=$(find . \( -name "uv.lock" -o -name "poetry.lock" -o -name "Pipfile.lock" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.venv/*" \
  -not -path "*/site-packages/*" \
  -not -path "*/.git/*" 2>/dev/null)

PY_LOCK_HITS=0
PY_LOCK_COUNT=0
for lf in $PY_LOCKS; do
  pairs=$(awk '
    /^\[\[package\]\]/      { in_pkg=1; name=""; ver=""; next }
    in_pkg && /^[[:space:]]*name[[:space:]]*=/ {
      n=$0; sub(/^[^"]*"/, "", n); sub(/".*$/, "", n); name=n
    }
    in_pkg && /^[[:space:]]*version[[:space:]]*=/ {
      v=$0; sub(/^[^"]*"/, "", v); sub(/".*$/, "", v); ver=v
      if (name != "" && ver != "") print name "|" ver
      in_pkg=0
    }
  ' "$lf")
  [ -z "$pairs" ] && continue
  while IFS='|' read -r pn pv; do
    [ -z "$pn" ] && continue
    PY_LOCK_COUNT=$((PY_LOCK_COUNT+1))
    if is_bad_pypi "$pn" "$pv"; then
      fail "$lf locks $pn@$pv (MALICIOUS)"
      PY_LOCK_HITS=$((PY_LOCK_HITS+1))
    fi
  done <<< "$pairs"
done

if [ -z "$PY_LOCKS" ]; then
  echo "${DIM}No Python lockfiles found${RESET}"
elif [ "$PY_LOCK_HITS" -eq 0 ]; then
  ok "No malicious PyPI versions in Python lockfiles ($PY_LOCK_COUNT pinned entries scanned)"
else
  FAILED=$((FAILED+PY_LOCK_HITS))
fi

# ---- 7. pypi: pinned versions in pyproject.toml / requirements*.txt --------
hdr "7. pypi: pyproject.toml / requirements*.txt pins"

PY_MANIFESTS=$(find . \( -name "pyproject.toml" -o -name "requirements*.txt" -o -name "Pipfile" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.venv/*" \
  -not -path "*/site-packages/*" \
  -not -path "*/.git/*" 2>/dev/null)

PY_PIN_HITS=0
for mf in $PY_MANIFESTS; do
  # Only `==` is treated as an exact pin; ranges (>=, ~=, etc.) cannot be
  # evaluated without resolution and are intentionally ignored.
  pairs=$(awk '
    {
      line = $0
      gsub(/#.*$/, "", line)
      while (match(line, /[A-Za-z0-9_.\-]+[[:space:]]*==[[:space:]]*[0-9][0-9A-Za-z._\-]*/)) {
        m = substr(line, RSTART, RLENGTH)
        line = substr(line, RSTART + RLENGTH)
        gsub(/[ \t]/, "", m)
        n = index(m, "==")
        if (n > 0) {
          name = substr(m, 1, n - 1)
          ver  = substr(m, n + 2)
          gsub(/\[.*\]/, "", name)
          if (name != "" && ver != "") print name "|" ver
        }
      }
    }
  ' "$mf")
  [ -z "$pairs" ] && continue
  while IFS='|' read -r pn pv; do
    [ -z "$pn" ] && continue
    if is_bad_pypi "$pn" "$pv"; then
      fail "$mf pins $pn==$pv (MALICIOUS)"
      PY_PIN_HITS=$((PY_PIN_HITS+1))
    fi
  done <<< "$pairs"
done

if [ -z "$PY_MANIFESTS" ]; then
  echo "${DIM}No Python manifests found${RESET}"
elif [ "$PY_PIN_HITS" -eq 0 ]; then
  ok "No PyPI exact-pin (==) matches against the compromised list"
else
  FAILED=$((FAILED+PY_PIN_HITS))
fi

# ---- 8. pypi: installed site-packages (if present) -------------------------
hdr "8. pypi: installed site-packages"

DIST_DIRS=$(find . -type d -path "*/site-packages/*" -name "*.dist-info" \
  -not -path "*/.git/*" 2>/dev/null)

DIST_HITS=0
DIST_COUNT=0
if [ -n "$DIST_DIRS" ]; then
  while IFS= read -r d; do
    base=$(basename "$d" .dist-info)
    name="${base%-*}"
    ver="${base##*-}"
    [ -z "$name" ] || [ -z "$ver" ] && continue
    DIST_COUNT=$((DIST_COUNT+1))
    if is_bad_pypi "$name" "$ver"; then
      fail "$d shows $name@$ver installed (MALICIOUS)"
      DIST_HITS=$((DIST_HITS+1))
    fi
  done <<< "$DIST_DIRS"
fi

if [ "$DIST_COUNT" -eq 0 ]; then
  echo "${DIM}No site-packages dist-info entries scanned${RESET}"
elif [ "$DIST_HITS" -eq 0 ]; then
  ok "No malicious installs among $DIST_COUNT site-packages entries"
else
  FAILED=$((FAILED+DIST_HITS))
fi

# ---- 9. Cross-cutting IOCs (attacker domains, IDE persistence) --------------
hdr "9. Cross-cutting IOCs (attacker domains, poisoned IDE configs)"

IOC_HITS=0
SCRIPT_NAME=$(basename "$0")
CSV_NAME=$(basename "$CSV_PATH")

for dom in "${BAD_DOMAINS[@]}"; do
  hits=$(grep -rIl \
    --exclude="$SCRIPT_NAME" \
    --exclude="$CSV_NAME" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.venv \
    --exclude-dir=site-packages \
    --exclude-dir=.next \
    --exclude-dir=.turbo \
    --exclude-dir=.output \
    "$dom" . 2>/dev/null)
  if [ -n "$hits" ]; then
    fail "References to $dom found:"
    echo "$hits" | sed 's/^/    /'
    IOC_HITS=$((IOC_HITS+1))
  fi
done

IDE_HITS=$(find . \( -path "*/.claude/setup.mjs" \
                   -o -path "*/.claude/router_runtime.js" \
                   -o -path "*/.vscode/setup.mjs" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null)
if [ -n "$IDE_HITS" ]; then
  fail "Suspicious payload-persistence files in .claude/ or .vscode/:"
  echo "$IDE_HITS" | sed 's/^/    /'
  IOC_HITS=$((IOC_HITS+1))
fi

if [ "$IOC_HITS" -eq 0 ]; then
  ok "No attacker-domain references or poisoned IDE configs"
else
  FAILED=$((FAILED+IOC_HITS))
fi

# ---- Summary -----------------------------------------------------------------
hdr "Summary"
if [ "$FAILED" -gt 0 ]; then
  echo "${RED}${BOLD}COMPROMISE INDICATORS FOUND ($FAILED).${RESET}"
  echo "Treat any machine/CI that ran install as compromised:"
  echo "  1. Rotate AWS / GCP / K8s / Vault / npm / PyPI / GitHub tokens and SSH keys"
  echo "  2. Review cloud audit logs from the campaign window"
  echo "  3. Bump matched npm packages to a safe version, wipe lockfile + node_modules, reinstall"
  echo "  4. Bump matched PyPI packages to a safe version, wipe uv.lock + .venv, reinstall"
  echo "  5. Refs: https://socket.dev/blog/tanstack-npm-packages-compromised-mini-shai-hulud-supply-chain-attack"
  exit 1
elif [ "$WARNED" -gt 0 ]; then
  echo "${YELLOW}${BOLD}No compromise indicators, but $WARNED warning(s).${RESET}"
  exit 0
else
  echo "${GREEN}${BOLD}CLEAN.${RESET} No matches against $NPM_COUNT npm + $PYPI_COUNT pypi compromised entries, and no IOCs."
  exit 0
fi
