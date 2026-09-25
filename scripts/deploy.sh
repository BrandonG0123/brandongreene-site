#!/usr/bin/env bash
#
# Build, verify, and push the site to your server.
#
#   ./scripts/deploy.sh                 # full: checks, build, upload
#   ./scripts/deploy.sh --skip-checks   # skip a11y/links/budget (don't make this a habit)
#   ./scripts/deploy.sh --dry-run       # show what would change, upload nothing
#
# Configure once in deploy/deploy.env (copy deploy/deploy.env.example).

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="deploy/deploy.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found."
  echo "       cp deploy/deploy.env.example $ENV_FILE and fill it in."
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

: "${SSH_HOST:?set SSH_HOST in deploy/deploy.env}"
: "${SSH_USER:?set SSH_USER in deploy/deploy.env}"
: "${REMOTE_DIR:?set REMOTE_DIR in deploy/deploy.env}"
SSH_PORT="${SSH_PORT:-22}"

SKIP_CHECKS=false
DRY_RUN=""
for arg in "$@"; do
  case "$arg" in
    --skip-checks) SKIP_CHECKS=true ;;
    --dry-run) DRY_RUN="--dry-run" ;;
    *) echo "unknown option: $arg"; exit 1 ;;
  esac
done

echo "==> Building"
npm run build

# The same gate CI uses. A broken site on your own server is still a broken
# site, and nobody tells you.
if [[ "$SKIP_CHECKS" == false ]]; then
  echo
  echo "==> Verifying (accessibility, links, budget)"
  npm run test:a11y
  npm run test:links
  npm run test:budget
else
  echo
  echo "!!  Skipping checks. You are deploying unverified."
fi

# Refuse to ship a placeholder slot, whatever else happened.
if grep -rql 'Layout slot, not a project' dist --include='*.html' 2>/dev/null; then
  echo "error: a placeholder slot reached the build. Refusing to deploy."
  exit 1
fi

echo
echo "==> Uploading to ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}"
# Trailing slash on dist/ copies the CONTENTS, not the directory itself.
# --delete removes files on the server that no longer exist locally, so a
# deleted page actually disappears instead of lingering forever.
rsync -avz --delete $DRY_RUN \
  -e "ssh -p ${SSH_PORT}" \
  --chmod=D755,F644 \
  dist/ "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"

if [[ -n "$DRY_RUN" ]]; then
  echo
  echo "Dry run — nothing was uploaded."
else
  echo
  echo "Deployed. Check it:"
  echo "  curl -sI https://${SITE_DOMAIN:-your-domain} | head -1"
fi
