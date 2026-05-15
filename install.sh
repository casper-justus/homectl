#!/bin/sh
set -eu

REPO="casper-justus/homectl"
BRANCH="${HOMECTL_BRANCH:-main}"
TMP_DIR=""
NO_NODE=0

cleanup() {
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { printf "  ${CYAN}ℹ${NC} %s\n" "$*"; }
ok()    { printf "  ${GREEN}✓${NC} %s\n" "$*"; }
warn()  { printf "  ${YELLOW}⚠${NC} %s\n" "$*"; }
fail()  { printf "  ${RED}✗${NC} %s\n" "$*"; exit 1; }
header(){ printf "\n  ${BOLD}%s${NC}\n" "$*"; }

echo ""
echo "  ┌──────────────────────────────┐"
echo "  │       homectl install        │"
echo "  └──────────────────────────────┘"
echo ""

# --- Detect OS ---
OS="$(uname -s)"
case "$OS" in
  Linux)   OS="linux" ;;
  Darwin)  OS="macos" ;;
  *)
    fail "Unsupported OS: $OS. Try install.ps1 for Windows."
    ;;
esac
info "Detected OS: $OS"

# --- Check for Node.js ---
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node --version 2>&1)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -lt 18 ]; then
    fail "Node.js >= 18 required, found $NODE_VER"
  fi
  ok "Node.js $NODE_VER"
else
  warn "Node.js not found"
  header "Installing Node.js..."
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env)"
    fnm install --lts && fnm use lts-core-latest && ok "Node.js installed via fnm"
  elif command -v nvm >/dev/null 2>&1; then
    nvm install --lts && nvm use --lts && ok "Node.js installed via nvm"
  elif command -v brew >/dev/null 2>&1 && [ "$OS" = "macos" ]; then
    brew install node && ok "Node.js installed via Homebrew"
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sh - && apt-get install -y nodejs && ok "Node.js installed via apt"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nodejs && ok "Node.js installed via dnf"
  else
    NO_NODE=1
    warn "Could not auto-install Node.js."
    warn "Install manually: https://nodejs.org"
  fi
fi

# --- Check for git ---
if ! command -v git >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get install -y git && ok "git installed"
  elif command -v brew >/dev/null 2>&1; then
    brew install git && ok "git installed"
  else
    fail "git is required. Install it first."
  fi
fi
ok "git found"

# --- Download ---
header "Downloading homectl..."
TMP_DIR=$(mktemp -d "/tmp/homectl-XXXXXX")
URL="https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz"
curl -fsSL "$URL" -o "$TMP_DIR/repo.tar.gz" || fail "Failed to download from $URL"
tar -xzf "$TMP_DIR/repo.tar.gz" -C "$TMP_DIR"
SRC_DIR=$(find "$TMP_DIR" -maxdepth 1 -type d | tail -1)
ok "Downloaded $REPO ($BRANCH)"

# --- Install & Build ---
header "Installing dependencies..."
cd "$SRC_DIR"
npm install --no-audit --no-fund 2>&1 | while read -r line; do :; done
ok "Dependencies installed"

header "Building..."
npm run build 2>&1 | while read -r line; do :; done
ok "Build complete"

# --- Install globally ---
header "Installing globally..."
if [ "$(id -u)" -eq 0 ]; then
  npm install -g . --no-audit --no-fund 2>&1 | while read -r line; do :; done
else
  if command -v sudo >/dev/null 2>&1; then
    sudo npm install -g . --no-audit --no-fund 2>&1 | while read -r line; do :; done
  else
    npm link --no-audit --no-fund 2>&1 | while read -r line; do :; done
  fi
fi
ok "Global install complete"

# --- Verify ---
if command -v homectl >/dev/null 2>&1; then
  VER=$(homectl --version 2>&1)
  ok "homectl $VER installed!"
else
  warn "homectl not in PATH. Add npm global bin to your PATH or run: npm link"
fi

echo ""
echo "  ┌──────────────────────────────────────────┐"
echo "  │  Setup complete!                         │"
echo "  │                                          │"
echo "  │  Quick start:                            │"
echo "  │    homectl init                          │"
echo "  │    homectl host ls                       │"
echo "  │    homectl --help                        │"
echo "  └──────────────────────────────────────────┘"
echo ""
