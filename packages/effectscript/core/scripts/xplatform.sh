#!/usr/bin/env bash
# Cross-platform smoke test of the standalone binaries in dist-bin/ (ADR-0037, ADR-0038), for a
# developer machine: Linux glibc and musl builds in Docker containers (OrbStack or Docker
# Desktop; amd64 runs emulated on Apple silicon), darwin-x64 under Rosetta, and windows-x64 in a
# Parallels VM with --windows. Each binary prints its version, compiles a file, and runs one.
#
#   node scripts/standalone.ts build --target all && scripts/xplatform.sh [--windows "VM name"]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
bin="$root/dist-bin"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failed=0

cat >"$work/app.efx" <<'EOF'
const n: number = 40 + 2
console.log("ran", n, process.platform, process.arch, process.argv.slice(2).join(" "))
EOF

check() { # name, command…
  local name="$1"
  shift
  if out="$("$@" 2>&1)" && grep -q "ran 42" <<<"$out"; then
    echo "ok      $name: $(grep "ran 42" <<<"$out")"
  else
    echo "FAILED  $name"
    sed 's/^/        /' <<<"$out"
    failed=1
  fi
}

smoke='efx --version && efx print app.efx >/dev/null && efx run app.efx --flag'

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  while read -r platform image target; do
    [ -f "$bin/efx-$target" ] || { echo "skipped $target: not built"; continue; }
    # musl builds need the C++ runtime, as Bun does on Alpine (install.sh says so too)
    setup=""
    case "$target" in *-musl) setup="apk add -q libstdc++ libgcc >/dev/null && " ;; esac
    check "$target on $image ($platform)" docker run --rm --platform "$platform" \
      -v "$bin/efx-$target:/usr/local/bin/efx:ro" -v "$work:/app" -w /app "$image" sh -c "$setup$smoke"
  done <<'EOF'
linux/arm64 debian:bookworm-slim linux-arm64
linux/amd64 debian:bookworm-slim linux-x64
linux/arm64 ubuntu:24.04 linux-arm64
linux/arm64 alpine:3.20 linux-arm64-musl
linux/amd64 alpine:3.20 linux-x64-musl
EOF
else
  echo "skipped Linux: Docker isn't running (orb start)"
fi

if [ "$(uname -s)" = Darwin ] && [ -f "$bin/efx-darwin-x64" ]; then
  if arch -x86_64 /usr/bin/true 2>/dev/null; then
    check "darwin-x64 under Rosetta" sh -c "cd '$work' && arch -x86_64 '$bin/efx-darwin-x64' run app.efx --flag"
  else
    echo "skipped darwin-x64: Rosetta isn't installed"
  fi
fi

if [ "${1:-}" = --windows ]; then
  vm="${2:-Windows 11}"
  if [ -f "$bin/efx-windows-x64.exe" ] && command -v prlctl >/dev/null; then
    prlctl start "$vm" >/dev/null 2>&1 || true
    # Parallels shares only Desktop, Documents and Downloads of the Mac's home by default
    stage="$(mktemp -d "$HOME/Downloads/.efx-xplatform-XXXXXX")"
    trap 'rm -rf "$work" "$stage"' EXIT
    cp "$bin/efx-windows-x64.exe" "$stage/efx.exe"
    cp "$work/app.efx" "$stage/app.efx"
    share="\\\\Mac\\Home\\Downloads\\$(basename "$stage")"
    check "windows-x64 in Parallels ($vm)" prlctl exec "$vm" --current-user cmd /c \
      "pushd $share && efx.exe --version && efx.exe run app.efx --flag"
  else
    echo "skipped windows-x64: no efx-windows-x64.exe or no prlctl"
  fi
fi

exit "$failed"
