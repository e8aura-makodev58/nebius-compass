# Deployment (e8aura-deploy)

Architecture (user, 2026-10-19), on the Proxmox host:

| Machine | Role | Tailscale address |
|---|---|---|
| `e8aura-dev` | All development, agent worktrees, test suites | 100.73.62.28 |
| `e8aura-deploy` | All deployments (Docker Compose) | 100.91.9.126 |

## Server layout (`makodev58@e8aura-deploy`)

- `~/repos/nebius-compass.git`: bare repo; `deploy.sh` pushes the commit to deploy as branch `deploy`.
- `~/nebius-compass`: checkout of that commit (detached). Compose project `responsecompass`, volume `responsecompass-data`.
- `~/nebius-compass-env/.env` (mode 600, no secrets), symlinked into the checkout:
  `NEBIUS_TOKEN_FACTORY_API_KEY_FILE=/home/makodev58/secrets/nebius.token`,
  `COMPASS_BIND=100.91.9.126`, `COMPASS_HOST_PORT=3200`.
- `~/secrets/` (mode 700): `nebius.token` (mode 600). Optional `AMD_TOKEN_FACTORY_API_KEY_FILE`
  may point at another file here; without it AMD fails closed.
- Docker Engine and the Compose plugin from Docker's apt repository; `makodev58` is in the `docker` group.

## Deploy

From the integration checkout on e8aura-dev, after both suites pass on `master`:

```sh
scripts/deploy/deploy.sh            # deploys master
scripts/deploy/deploy.sh <commit>   # deploys a specific commit (rollback)
```

The script waits for the container's health check and prints logs if it fails. Runtime
state lives in the `responsecompass-data` volume and survives redeploys; a new volume is
seeded once from the tracked demo seed.

The app listens only on the Tailscale address (`http://100.91.9.126:3200`) until the public
URL is configured. Per the user, the public URL will reuse `compass.makodev58.com` after the
AMD hackathon 3 ends; then add the `tunnel` Compose profile and its token file.
