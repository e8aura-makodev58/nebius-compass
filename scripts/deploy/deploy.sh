#!/usr/bin/env bash
# Deploy master to e8aura-deploy (dev on e8aura-dev, deployments on e8aura-deploy).
# Pushes master to a bare repo on the server over SSH, checks it out into
# ~/nebius-compass, then rebuilds and restarts the Compose project and waits for health.
# The server keeps its own .env and key files; they are never copied from here.
#
# Usage (from the integration checkout): scripts/deploy/deploy.sh [git-ref]
set -euo pipefail
# DEPLOY_HOST (user@host) comes from the environment or a private env file outside the repo.
DEPLOY_ENV="${DEPLOY_ENV:-$HOME/nebius-tools/deploy.env}"
[ -f "$DEPLOY_ENV" ] && . "$DEPLOY_ENV"
HOST="${DEPLOY_HOST:?set DEPLOY_HOST=user@host or provide $DEPLOY_ENV}"
REF="${1:-master}"
SHA="$(git rev-parse --verify "$REF^{commit}")"

ssh -o BatchMode=yes "$HOST" 'test -d ~/repos/nebius-compass.git || git init -q --bare ~/repos/nebius-compass.git'
git push -q "$HOST:repos/nebius-compass.git" "$SHA:refs/heads/deploy" --force
ssh -o BatchMode=yes "$HOST" bash -s -- "$SHA" <<'REMOTE'
set -euo pipefail
SHA="$1"
if [ ! -d ~/nebius-compass/.git ]; then git clone -q ~/repos/nebius-compass.git ~/nebius-compass; fi
cd ~/nebius-compass
git fetch -q origin deploy
git checkout -q --detach "$SHA"
ln -sf ~/nebius-compass-env/.env .env
test -f ~/nebius-compass-env/.env || { echo "Missing ~/nebius-compass-env/.env on the server (see scripts/deploy/README.md)"; exit 1; }
docker compose up -d --build --remove-orphans
for i in $(seq 1 40); do
  status="$(docker inspect -f '{{.State.Health.Status}}' responsecompass 2>/dev/null || echo starting)"
  [ "$status" = healthy ] && { echo "Deployed $SHA: healthy"; exit 0; }
  sleep 3
done
echo "Deployed $SHA but the container is not healthy:"; docker compose ps; docker compose logs --tail 40 responsecompass; exit 1
REMOTE
