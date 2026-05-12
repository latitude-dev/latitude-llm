#!/usr/bin/env bash
# audit-tanstack-ghsa-g7cv.sh
#
# Audits a pnpm monorepo (or any JS project) for the TanStack supply-chain
# compromise published 2026-05-11.
# Advisory: https://github.com/TanStack/router/security/advisories/GHSA-g7cv-rxg3-hmpx
#
# Usage:  ./audit-tanstack-ghsa-g7cv.sh [path-to-repo-root]
# Exit:   0 = clean, 1 = compromise indicators found, 2 = usage error

set -u

ROOT="${1:-.}"
cd "$ROOT" 2>/dev/null || { echo "Cannot cd to $ROOT"; exit 2; }

# ANSI colors (skip if not a TTY)
if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; BOLD=""; DIM=""; RESET=""
fi

ok()    { echo "${GREEN}✓${RESET} $*"; }
warn()  { echo "${YELLOW}!${RESET} $*"; }
fail()  { echo "${RED}✗${RESET} $*"; }
hdr()   { echo; echo "${BOLD}== $* ==${RESET}"; }

FAILED=0
WARNED=0

# ---- Affected versions from the advisory -------------------------------------
# Format: "package|bad1|bad2|patched"
AFFECTED=(
  "@tanstack/arktype-adapter|1.166.12|1.166.15|1.166.16"
  "@tanstack/eslint-plugin-router|1.161.9|1.161.12|1.161.13"
  "@tanstack/eslint-plugin-start|0.0.4|0.0.7|0.0.8"
  "@tanstack/history|1.161.9|1.161.12|1.161.13"
  "@tanstack/nitro-v2-vite-plugin|1.154.12|1.154.15|1.154.16"
  "@tanstack/react-router|1.169.5|1.169.8|1.169.9"
  "@tanstack/react-router-devtools|1.166.16|1.166.19|1.166.20"
  "@tanstack/react-router-ssr-query|1.166.15|1.166.18|1.166.19"
  "@tanstack/react-start|1.167.68|1.167.71|1.167.72"
  "@tanstack/react-start-client|1.166.51|1.166.54|1.166.55"
  "@tanstack/react-start-rsc|0.0.47|0.0.50|0.0.51"
  "@tanstack/react-start-server|1.166.55|1.166.58|1.166.59"
  "@tanstack/router-cli|1.166.46|1.166.49|1.166.50"
  "@tanstack/router-core|1.169.5|1.169.8|1.169.9"
  "@tanstack/router-devtools|1.166.16|1.166.19|1.166.20"
  "@tanstack/router-devtools-core|1.167.6|1.167.9|1.167.10"
  "@tanstack/router-generator|1.166.45|1.166.48|1.166.49"
  "@tanstack/router-plugin|1.167.38|1.167.41|1.167.42"
  "@tanstack/router-ssr-query-core|1.168.3|1.168.6|1.168.7"
  "@tanstack/router-utils|1.161.11|1.161.14|1.161.15"
  "@tanstack/router-vite-plugin|1.166.53|1.166.56|1.166.57"
  "@tanstack/solid-router|1.169.5|1.169.8|1.169.9"
  "@tanstack/solid-router-devtools|1.166.16|1.166.19|1.166.20"
  "@tanstack/solid-router-ssr-query|1.166.15|1.166.18|1.166.19"
  "@tanstack/solid-start|1.167.65|1.167.68|1.167.69"
  "@tanstack/solid-start-client|1.166.50|1.166.53|1.166.54"
  "@tanstack/solid-start-server|1.166.54|1.166.57|1.166.58"
  "@tanstack/start-client-core|1.168.5|1.168.8|1.168.9"
  "@tanstack/start-fn-stubs|1.161.9|1.161.12|1.161.13"
  "@tanstack/start-plugin-core|1.169.23|1.169.26|1.169.27"
  "@tanstack/start-server-core|1.167.33|1.167.36|1.167.37"
  "@tanstack/start-static-server-functions|1.166.44|1.166.47|1.166.48"
  "@tanstack/start-storage-context|1.166.38|1.166.41|1.166.42"
  "@tanstack/valibot-adapter|1.166.12|1.166.15|1.166.16"
  "@tanstack/virtual-file-routes|1.161.10|1.161.13|1.161.14"
  "@tanstack/vue-router|1.169.5|1.169.8|1.169.9"
  "@tanstack/vue-router-devtools|1.166.16|1.166.19|1.166.20"
  "@tanstack/vue-router-ssr-query|1.166.15|1.166.18|1.166.19"
  "@tanstack/vue-start|1.167.61|1.167.64|1.167.65"
  "@tanstack/vue-start-client|1.166.46|1.166.49|1.166.50"
  "@tanstack/vue-start-server|1.166.50|1.166.53|1.166.54"
  "@tanstack/zod-adapter|1.166.12|1.166.15|1.166.16"
)

BAD_GIT_REF="79ac49eedf774dd4b0cfa308722bc463cfe5885c"
FAKE_PKG="@tanstack/setup"
PAYLOAD_FILENAME="router_init.js"

# ---- PyPI side of the same TeamPCP campaign (May 2026) ----------------------
# Format: "package|bad|patched"  (canonical PEP 503 names)
AFFECTED_PYPI=(
  "mistralai|2.4.6|2.4.5"
  "guardrails-ai|0.10.1|0.10.0"
)
PAYLOAD_PYZ="transformers.pyz"
BAD_DOMAIN="git-tanstack.com"

echo "${BOLD}TanStack GHSA-g7cv-rxg3-hmpx + PyPI (mistralai / guardrails-ai) audit${RESET}"
echo "${DIM}Auditing: $(pwd)${RESET}"

# ---- 1. Smoking-gun indicators in the lockfile -------------------------------
hdr "1. Lockfile indicators of compromise"

LOCKFILES=()
[ -f pnpm-lock.yaml ]    && LOCKFILES+=("pnpm-lock.yaml")
[ -f package-lock.json ] && LOCKFILES+=("package-lock.json")
[ -f yarn.lock ]         && LOCKFILES+=("yarn.lock")
[ -f bun.lockb ]         && LOCKFILES+=("bun.lockb")

if [ ${#LOCKFILES[@]} -eq 0 ]; then
  warn "No lockfile found at $ROOT — are you at the repo root?"
  WARNED=$((WARNED+1))
else
  echo "${DIM}Found lockfiles: ${LOCKFILES[*]}${RESET}"
  for lf in "${LOCKFILES[@]}"; do
    if grep -q "$BAD_GIT_REF" "$lf" 2>/dev/null; then
      fail "$lf contains the malicious git ref ($BAD_GIT_REF)"
      FAILED=$((FAILED+1))
    fi
    if grep -q "$FAKE_PKG" "$lf" 2>/dev/null; then
      fail "$lf references the fake package $FAKE_PKG"
      FAILED=$((FAILED+1))
    fi
  done
  if [ "$FAILED" -eq 0 ]; then
    ok "No malicious git ref or fake-package references in lockfiles"
  fi
fi

# ---- 2. Payload file on disk -------------------------------------------------
hdr "2. Payload file on disk"

PAYLOAD_HITS=$(find . -name "$PAYLOAD_FILENAME" \
  -not -path "*/.git/*" \
  -not -path "*/.next/*" \
  2>/dev/null)

if [ -n "$PAYLOAD_HITS" ]; then
  fail "Found $PAYLOAD_FILENAME on disk:"
  echo "$PAYLOAD_HITS" | sed 's/^/    /'
  FAILED=$((FAILED+1))
else
  ok "No $PAYLOAD_FILENAME found on disk"
fi

FAKE_PKG_HITS=$(find . -path "*/$FAKE_PKG*" -not -path "*/.git/*" 2>/dev/null)
if [ -n "$FAKE_PKG_HITS" ]; then
  fail "Found $FAKE_PKG directory on disk:"
  echo "$FAKE_PKG_HITS" | sed 's/^/    /'
  FAILED=$((FAILED+1))
else
  ok "No $FAKE_PKG directory found"
fi

# ---- 3. Installed versions vs affected list ----------------------------------
hdr "3. Installed @tanstack/* versions"

# Collect installed @tanstack/* versions into parallel arrays
# (bash 3.2 on macOS lacks associative arrays).
INSTALLED_NAMES=()
INSTALLED_VERS=()

collect_pj() {
  local pj name ver
  pj="$1"
  name=$(grep -m1 '"name"' "$pj" | sed -E 's/.*"name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
  ver=$(grep -m1 '"version"' "$pj" | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
  case "$name" in
    @tanstack/*)
      [ -n "$ver" ] || return
      INSTALLED_NAMES+=("$name")
      INSTALLED_VERS+=("$ver")
      ;;
  esac
}

if [ -d node_modules/@tanstack ]; then
  while IFS= read -r pj; do
    collect_pj "$pj"
  done < <(find node_modules/@tanstack -maxdepth 3 -name package.json 2>/dev/null)
fi

if [ -d node_modules/.pnpm ]; then
  while IFS= read -r pj; do
    collect_pj "$pj"
  done < <(find node_modules/.pnpm -maxdepth 6 -path "*@tanstack*" -name package.json 2>/dev/null)
fi

if [ ${#INSTALLED_NAMES[@]} -eq 0 ]; then
  warn "No installed @tanstack/* packages found. Did you run pnpm install?"
  WARNED=$((WARNED+1))
else
  echo "${DIM}Found ${#INSTALLED_NAMES[@]} installed @tanstack/* package entries${RESET}"
  BAD_INSTALLS=0
  for entry in "${AFFECTED[@]}"; do
    IFS='|' read -r pkg bad1 bad2 patched <<< "$entry"
    i=0
    while [ $i -lt ${#INSTALLED_NAMES[@]} ]; do
      installed_name="${INSTALLED_NAMES[$i]}"
      installed_ver="${INSTALLED_VERS[$i]}"
      i=$((i+1))
      [ "$installed_name" != "$pkg" ] && continue
      if [ "$installed_ver" = "$bad1" ] || [ "$installed_ver" = "$bad2" ]; then
        fail "$pkg@$installed_ver is MALICIOUS — patched: $patched"
        BAD_INSTALLS=$((BAD_INSTALLS+1))
      fi
    done
  done
  if [ "$BAD_INSTALLS" -eq 0 ]; then
    ok "No installed @tanstack/* version matches the affected list"
  else
    FAILED=$((FAILED+BAD_INSTALLS))
  fi
fi

# ---- 4. package.json pins (across workspaces) --------------------------------
hdr "4. package.json pinned versions (all workspaces)"

PJSONS=$(find . -name package.json \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  2>/dev/null)

PIN_WARNINGS=0
for pj in $PJSONS; do
  # Pull every @tanstack/* dep line and check the version literal
  while IFS= read -r line; do
    pkg=$(echo "$line" | sed -E 's/.*"(@tanstack\/[^"]+)".*/\1/')
    ver=$(echo "$line" | sed -E 's/.*:[[:space:]]*"([^"]+)".*/\1/')
    # Strip range chars
    cleaned=$(echo "$ver" | sed -E 's/^[\^~>=<]+//; s/[[:space:]].*//')
    for entry in "${AFFECTED[@]}"; do
      IFS='|' read -r ap bad1 bad2 patched <<< "$entry"
      [ "$ap" != "$pkg" ] && continue
      if [ "$cleaned" = "$bad1" ] || [ "$cleaned" = "$bad2" ]; then
        fail "$pj pins $pkg to $ver (MALICIOUS — bump to $patched)"
        PIN_WARNINGS=$((PIN_WARNINGS+1))
      fi
    done
  done < <(grep -E '"@tanstack/[^"]+"[[:space:]]*:' "$pj" 2>/dev/null)
done

if [ "$PIN_WARNINGS" -eq 0 ]; then
  ok "No package.json pins to malicious versions"
else
  FAILED=$((FAILED+PIN_WARNINGS))
fi

# ---- 5. PyPI lockfile and manifest pins -------------------------------------
hdr "5. PyPI lockfile / manifest pins (uv.lock, poetry.lock, pyproject.toml, requirements*.txt)"

PYPI_LOCKS=$(find . \( -name "uv.lock" -o -name "poetry.lock" -o -name "Pipfile.lock" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.venv/*" \
  -not -path "*/site-packages/*" \
  -not -path "*/.git/*" 2>/dev/null)

PY_REQS=$(find . \( -name "requirements*.txt" -o -name "pyproject.toml" -o -name "Pipfile" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.venv/*" \
  -not -path "*/site-packages/*" \
  -not -path "*/.git/*" 2>/dev/null)

PY_HITS=0

for lf in $PYPI_LOCKS; do
  pairs=$(awk '
    /^\[\[package\]\]/ { in_pkg=1; name=""; ver=""; next }
    in_pkg && /^[[:space:]]*name[[:space:]]*=/ {
      n=$0; sub(/^[^"]*"/, "", n); sub(/".*$/, "", n); name=n
    }
    in_pkg && /^[[:space:]]*version[[:space:]]*=/ {
      v=$0; sub(/^[^"]*"/, "", v); sub(/".*$/, "", v); ver=v
      if (name != "" && ver != "") print name"|"ver
      in_pkg=0
    }
  ' "$lf")
  if [ -n "$pairs" ]; then
    while IFS='|' read -r pn pv; do
      [ -z "$pn" ] && continue
      for entry in "${AFFECTED_PYPI[@]}"; do
        IFS='|' read -r ap bad patched <<< "$entry"
        if [ "$pn" = "$ap" ] && [ "$pv" = "$bad" ]; then
          fail "$lf locks $pn@$pv (MALICIOUS — patched: $patched)"
          PY_HITS=$((PY_HITS+1))
        fi
      done
    done <<< "$pairs"
  fi
done

for rf in $PY_REQS; do
  for entry in "${AFFECTED_PYPI[@]}"; do
    IFS='|' read -r ap bad patched <<< "$entry"
    if grep -qE "[\"']?${ap}[\"']?[[:space:]]*(==|@)[[:space:]]*[\"']?${bad}[\"']?" "$rf" 2>/dev/null; then
      fail "$rf pins $ap to $bad (MALICIOUS — patched: $patched)"
      PY_HITS=$((PY_HITS+1))
    fi
  done
done

if [ -z "$PYPI_LOCKS" ] && [ -z "$PY_REQS" ]; then
  echo "${DIM}No Python lockfiles or manifests found${RESET}"
elif [ "$PY_HITS" -eq 0 ]; then
  ok "No malicious PyPI versions in Python lockfiles or manifests"
else
  FAILED=$((FAILED+PY_HITS))
fi

# ---- 6. Installed PyPI packages (site-packages dist-info) -------------------
hdr "6. Installed PyPI packages (site-packages dist-info)"

DIST_HITS=0
DIST_DIRS=$(find . -type d -path "*/site-packages/*" \
  \( -name "mistralai-*.dist-info" \
     -o -name "guardrails_ai-*.dist-info" \
     -o -name "guardrails-ai-*.dist-info" \) \
  -not -path "*/.git/*" 2>/dev/null)

if [ -n "$DIST_DIRS" ]; then
  while IFS= read -r d; do
    base=$(basename "$d" .dist-info)
    name="${base%-*}"
    ver="${base##*-}"
    case "$name" in
      guardrails_ai) name="guardrails-ai" ;;
    esac
    for entry in "${AFFECTED_PYPI[@]}"; do
      IFS='|' read -r ap bad patched <<< "$entry"
      if [ "$name" = "$ap" ] && [ "$ver" = "$bad" ]; then
        fail "$d shows $name@$ver installed (MALICIOUS — patched: $patched)"
        DIST_HITS=$((DIST_HITS+1))
      fi
    done
  done <<< "$DIST_DIRS"
fi

if [ "$DIST_HITS" -eq 0 ]; then
  ok "No malicious mistralai / guardrails-ai installs found in site-packages"
else
  FAILED=$((FAILED+DIST_HITS))
fi

# ---- 7. Cross-cutting IOCs (.pyz payload, attacker domain, IDE hooks) -------
hdr "7. Cross-cutting IOCs (.pyz payload, attacker domain, poisoned IDE configs)"

IOC_HITS=0

PYZ_HITS=$(find . -name "$PAYLOAD_PYZ" -not -path "*/.git/*" 2>/dev/null)
if [ -n "$PYZ_HITS" ]; then
  fail "Found $PAYLOAD_PYZ on disk:"
  echo "$PYZ_HITS" | sed 's/^/    /'
  IOC_HITS=$((IOC_HITS+1))
fi

if [ -e "/tmp/$PAYLOAD_PYZ" ]; then
  fail "/tmp/$PAYLOAD_PYZ is present (payload staging path)"
  IOC_HITS=$((IOC_HITS+1))
fi

SCRIPT_NAME=$(basename "$0")
DOMAIN_HITS=$(grep -rIl \
  --exclude="$SCRIPT_NAME" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=.venv \
  --exclude-dir=site-packages \
  "$BAD_DOMAIN" . 2>/dev/null)
if [ -n "$DOMAIN_HITS" ]; then
  fail "References to $BAD_DOMAIN found:"
  echo "$DOMAIN_HITS" | sed 's/^/    /'
  IOC_HITS=$((IOC_HITS+1))
fi

IDE_HITS=$(find . \( -path "*/.claude/setup.mjs" -o -path "*/.vscode/setup.mjs" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null)
if [ -n "$IDE_HITS" ]; then
  fail "Suspicious setup.mjs in .claude/ or .vscode/ (payload persistence IOC):"
  echo "$IDE_HITS" | sed 's/^/    /'
  IOC_HITS=$((IOC_HITS+1))
fi

if [ "$IOC_HITS" -eq 0 ]; then
  ok "No payload artifacts, attacker-domain references, or poisoned IDE configs"
else
  FAILED=$((FAILED+IOC_HITS))
fi

# ---- Summary -----------------------------------------------------------------
hdr "Summary"
if [ "$FAILED" -gt 0 ]; then
  echo "${RED}${BOLD}COMPROMISE INDICATORS FOUND ($FAILED).${RESET}"
  echo "Treat any machine/CI that ran install as compromised."
  echo "  1. Rotate AWS / GCP / K8s / Vault / npm / PyPI / GitHub tokens and SSH keys"
  echo "  2. Review cloud audit logs from 2026-05-11 19:20 UTC onward"
  echo "  3. Bump @tanstack/* to patched versions, wipe pnpm-lock.yaml + node_modules, reinstall"
  echo "  4. Bump mistralai <=2.4.5 and guardrails-ai <=0.10.0, wipe uv.lock + .venv, reinstall"
  echo "  5. npm advisory:  https://github.com/TanStack/router/security/advisories/GHSA-g7cv-rxg3-hmpx"
  echo "  6. PyPI writeup:  https://safedep.io/mass-npm-supply-chain-attack-tanstack-mistral/"
  exit 1
elif [ "$WARNED" -gt 0 ]; then
  echo "${YELLOW}${BOLD}No compromise indicators, but $WARNED warning(s).${RESET}"
  echo "Review warnings above (likely you need to run pnpm install, or you're not at repo root)."
  exit 0
else
  echo "${GREEN}${BOLD}CLEAN.${RESET} No indicators of GHSA-g7cv-rxg3-hmpx found."
  exit 0
fi
