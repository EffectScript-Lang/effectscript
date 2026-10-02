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
    # shellcheck disable=SC2001 # indent every line
    sed 's/^/        /' <<<"$out"
    failed=1
  fi
}

smoke='efx --version && efx print app.efx >/dev/null && efx run app.efx --flag'
# install.sh against the packaged release (scripts/standalone.ts package), served over HTTP
install='sh /install.sh && ~/.effectscript/bin/efx run app.efx --flag'
port=""
if [ -f "$bin/SHASUMS256.txt" ] && command -v python3 >/dev/null; then
  mkdir -p "$work/release/latest/download"
  cp "$bin"/efx-*.tar.gz "$bin"/efx-*.zip "$bin/SHASUMS256.txt" "$work/release/latest/download/" 2>/dev/null || true
  port=$((20000 + RANDOM % 10000))
  python3 -m http.server "$port" --bind 0.0.0.0 --directory "$work/release" >/dev/null 2>&1 &
  server=$!
  disown "$server"
  trap 'kill "$server" 2>/dev/null; rm -rf "$work"' EXIT
  sleep 1
fi

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  while read -r platform image target; do
    [ -f "$bin/efx-$target" ] || { echo "skipped $target: not built"; continue; }
    # musl builds need the C++ runtime, as Bun does on Alpine (install.sh says so too)
    setup=""
    case "$target" in *-musl) setup="apk add -q libstdc++ libgcc >/dev/null && " ;; esac
    check "$target on $image ($platform)" docker run --rm --platform "$platform" \
      -v "$bin/efx-$target:/usr/local/bin/efx:ro" -v "$work:/app" -w /app "$image" sh -c "$setup$smoke"
    if [ -n "$port" ]; then
      # Debian and Ubuntu images ship neither curl nor wget; Alpine has busybox wget
      case "$image" in debian* | ubuntu*) setup="apt-get update -qq && apt-get install -qq -y curl >/dev/null && " ;; esac
      check "install.sh on $image ($platform)" docker run --rm --platform "$platform" \
        -e EFX_DOWNLOAD_BASE="http://host.docker.internal:$port" \
        -v "$root/distribution/install.sh:/install.sh:ro" -v "$work:/app" -w /app "$image" sh -c "$setup$install"
    fi
  done <<'EOF'
linux/arm64 debian:bookworm-slim linux-arm64
linux/amd64 debian:bookworm-slim linux-x64
linux/arm64 ubuntu:24.04 linux-arm64
linux/arm64 alpine:3.20 linux-arm64-musl
linux/amd64 alpine:3.20 linux-x64-musl
EOF
  # the generated formula with real Homebrew: brew install from a local tap, then brew test
  if [ -n "$port" ]; then
    node "$root/scripts/homebrew.ts" --version "$(node -p "require('$root/package.json').version")" \
      --shasums "$bin/SHASUMS256.txt" --base "http://host.docker.internal:$port/latest/download" >"$work/effectscript.rb"
    # shellcheck disable=SC2016 # the container's shell expands $(brew …)
    check "Homebrew formula on homebrew/brew" docker run --rm -e HOMEBREW_NO_AUTO_UPDATE=1 \
      -e HOMEBREW_NO_INSTALL_FROM_API=1 -e HOMEBREW_NO_ANALYTICS=1 -v "$work:/app" homebrew/brew sh -c '
        brew tap-new --no-git local/efx >/dev/null &&
        cp /app/effectscript.rb "$(brew --repository local/efx)/Formula/effectscript.rb" &&
        brew install local/efx/effectscript && brew test local/efx/effectscript &&
        cd /tmp && cp /app/app.efx . && efx run app.efx --flag'
  fi
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
