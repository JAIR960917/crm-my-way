#!/usr/bin/env bash
# Atualiza o código na VPS e roda deploy.sh.
# Descarta alterações locais (ex.: runtime-config.js gerado pelo deploy anterior).
#
# Uso:
#   ./scripts/vps-update.sh              # deploy completo
#   ./scripts/vps-update.sh --frontend     # só frontend
#   ./scripts/vps-update.sh --migrations   # só migrations
#
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/crm}"
cd "$PROJECT_DIR"

G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; N='\033[0m'
log() { echo -e "${B}[vps-update]${N} $*"; }

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Erro: ${PROJECT_DIR} não é um repositório Git." >&2
  exit 1
fi

log "Buscando atualizações no GitHub..."
git fetch origin main

log "Sincronizando com origin/main (descarta mudanças locais de arquivos versionados)..."
git reset --hard origin/main

log "Limpando runtime-config.js antigo (deploy.sh recria com a URL da VPS)..."
rm -f public/runtime-config.js

MODE="${1:-all}"
if [ "$MODE" = "all" ]; then
  exec ./deploy.sh
else
  exec ./deploy.sh "$MODE"
fi
