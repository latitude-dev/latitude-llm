#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ensure_env_files() {
  if [[ ! -f "$REPO_ROOT/.env.development" ]]; then
    cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env.development"
  fi

  if [[ ! -f "$REPO_ROOT/.env.test" ]]; then
    cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env.test"
  fi
}

ensure_goose() {
  if command -v goose >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends curl
  fi

  local goose_version="3.24.1"
  local arch
  arch="$(dpkg --print-architecture)"

  local goose_arch
  case "$arch" in
    amd64) goose_arch="x86_64" ;;
    arm64) goose_arch="aarch64" ;;
    *) goose_arch="$arch" ;;
  esac

  local tmp_bin
  tmp_bin="$(mktemp)"
  curl -fsSL "https://github.com/pressly/goose/releases/download/v${goose_version}/goose_linux_${goose_arch}" -o "$tmp_bin"
  sudo install -m 0755 "$tmp_bin" /usr/local/bin/goose
  rm -f "$tmp_bin"
}

main() {
  ensure_env_files
  ensure_goose
  pnpm install --frozen-lockfile
}

main "$@"
