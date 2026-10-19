# Deployment

Deployment uses a development machine and a separate Docker host reached by SSH. Set
`DEPLOY_HOST` to your authorized `user@host`, either in the environment or in a private
env file outside the repo (`DEPLOY_ENV`, default `~/nebius-tools/deploy.env`). Provision
the host's environment and server-side key files before deploying. Keep machine
addresses, account names and actual credential paths in private operator notes.

## Server layout

- `~/repos/nebius-compass.git`: a bare repo; `deploy.sh` pushes the commit to deploy as
  branch `deploy`.
- `~/nebius-compass`: a checkout of that commit (detached). Compose project
  `responsecompass`, volume `responsecompass-data`.
- A separately maintained runtime `.env` (mode 600, no secrets), symlinked into the
  checkout. It sets `NEBIUS_TOKEN_FACTORY_API_KEY_FILE` (required), and `COMPASS_BIND` /
  `COMPASS_HOST_PORT` for the published address. It may set `AMD_TOKEN_FACTORY_API_KEY_FILE`
  and `COMPASS_DAILY_BUDGET_USD`.
- Docker Engine with the Compose plugin; the deploying user is in the `docker` group.

## Deploy

From the integration checkout on the development machine, after both suites pass on
`master`:

```sh
scripts/deploy/deploy.sh            # deploys master
scripts/deploy/deploy.sh <commit>   # deploys a specific commit (rollback)
```

The script waits for the container's health check, and prints logs if it fails. Runtime
state lives in the `responsecompass-data` volume and survives redeploys; a new volume is
seeded once from the tracked demo seed.

Before public release the service is reachable only through the operator's private
network. That address is not a judge URL. Publish a verified public URL separately;
a Cloudflare deployment uses the `tunnel` Compose profile and a server-side token file.
