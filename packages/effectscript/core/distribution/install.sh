#!/bin/sh
# Installs the standalone efx binary (ADR-0037, ADR-0038):
#
#   curl -fsSL https://effectscript.dev/install | sh
#
# Settings (environment variables):
#   EFX_VERSION        a released version, such as 4.0.0-alpha.1 (default: the latest release)
#   EFX_INSTALL        where to install (default: ~/.effectscript); efx goes in $EFX_INSTALL/bin
#   EFX_DOWNLOAD_BASE  where releases live (default: the EffectScript-Lang/effect-lang releases)
#
# The archive must match the release's SHASUMS256.txt, and the binary must run before it replaces
# anything. Shell startup files are never edited: the script prints the PATH line to add.
set -eu

fail() {
  printf 'efx install: %s\n' "$1" >&2
  exit 1
}

download() { # url, file
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$1" -O "$2"
  else
    fail "needs curl or wget to download efx"
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    fail "needs sha256sum or shasum to verify the download"
  fi
}

# Whether the system libc is musl (Alpine). It asks ldd, because a glibc system can carry a musl
# loader too (the musl package, for cross-compiling).
is_musl() {
  if command -v ldd >/dev/null 2>&1; then
    case "$(ldd --version 2>&1 || true)" in
      *musl*) return 0 ;;
      *) return 1 ;;
    esac
  fi
  ! ls /lib*/ld-linux-* /lib/*/ld-linux-* >/dev/null 2>&1 && ls /lib/ld-musl-* >/dev/null 2>&1
}

# Everything runs from main, so a download cut short never runs half a script.
main() {
  base="${EFX_DOWNLOAD_BASE:-https://github.com/EffectScript-Lang/effect-lang/releases}"
  version="${EFX_VERSION:-latest}"
  dir="${EFX_INSTALL:-$HOME/.effectscript}"
  # the PATH line must work from any directory
  case "$dir" in /*) ;; *) dir="$(pwd)/$dir" ;; esac

  system="$(uname -s)"
  machine="$(uname -m)"
  case "$system" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    MINGW* | MSYS* | CYGWIN*)
      fail "on Windows, download efx-windows-x64.zip from $base, or use npm i -D effectscript"
      ;;
    *) fail "there is no efx build for $system yet: use npm i -D effectscript" ;;
  esac
  case "$machine" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) fail "there is no efx build for $machine yet: use npm i -D effectscript" ;;
  esac
  # a shell running under Rosetta still gets the native Apple silicon build
  if [ "$os" = darwin ] && [ "$arch" = x64 ] &&
    [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then
    arch=arm64
  fi
  target="$os-$arch"
  if [ "$os" = linux ] && is_musl; then
    target="$target-musl"
    ls /usr/lib/libstdc++.so.6* >/dev/null 2>&1 ||
      fail "efx on musl (Alpine) needs the C++ runtime first: apk add libstdc++ libgcc"
  fi

  if [ "$version" = latest ]; then
    url="$base/latest/download"
  else
    url="$base/download/effectscript@$version"
  fi
  asset="efx-$target.tar.gz"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/efx-install.XXXXXX")"
  trap 'rm -rf "$tmp"' EXIT
  # Ctrl-C and kill stop with the usual exit codes; the EXIT trap still cleans up
  trap 'exit 130' INT
  trap 'exit 143' TERM

  printf 'Downloading %s (%s)\n' "$asset" "$version"
  download "$url/$asset" "$tmp/$asset" ||
    fail "couldn't download $url/$asset: check that $version is a released version with a $target build"
  download "$url/SHASUMS256.txt" "$tmp/SHASUMS256.txt" || fail "couldn't download $url/SHASUMS256.txt"
  expected="$(awk -v file="$asset" '$2 == file { print $1 }' "$tmp/SHASUMS256.txt")"
  [ -n "$expected" ] || fail "SHASUMS256.txt has no checksum for $asset"
  actual="$(sha256 "$tmp/$asset")"
  [ "$actual" = "$expected" ] ||
    fail "checksum mismatch for $asset (expected $expected, got $actual): nothing was installed"

  mkdir "$tmp/unpacked"
  tar -xzf "$tmp/$asset" -C "$tmp/unpacked"
  [ -f "$tmp/unpacked/efx" ] || fail "$asset has no efx binary"

  # Copy next to the target, check that it runs there (the temp directory may be mounted noexec),
  # then rename: a running efx is never left half-written.
  mkdir -p "$dir/bin"
  cp "$tmp/unpacked/efx" "$dir/bin/.efx.new"
  chmod +x "$dir/bin/.efx.new"
  if ! installed="$("$dir/bin/.efx.new" --version 2>&1)"; then
    rm -f "$dir/bin/.efx.new"
    fail "the downloaded efx doesn't run here: $installed"
  fi
  mv -f "$dir/bin/.efx.new" "$dir/bin/efx"
  printf 'Installed %s at %s\n' "$installed" "$dir/bin/efx"

  case ":$PATH:" in
    *":$dir/bin:"*) ;;
    *)
      printf '\nAdd efx to your PATH, for example in ~/.zshrc or ~/.bashrc:\n'
      # shellcheck disable=SC2016 # $PATH is for the user's shell to expand
      printf '  export PATH="%s/bin:$PATH"\n' "$dir"
      ;;
  esac
  printf '\nNext, in a project: efx init, then efx convert\n'
}

main "$@"
