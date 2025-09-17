# Latitude Helm Chart

Deploy Latitude (web, gateway, workers, websockets) to Kubernetes using public container images from GHCR.

- Chart path: `charts/latitude` (alias `@charts/latitude`)
- Images: `ghcr.io/latitude-dev/{web,gateway,workers,websockets,migrations}:latest`

## Prerequisites

- Kubernetes 1.23+
- Helm 3.9+
- A PostgreSQL database and Redis instance reachable from the cluster
- An Ingress controller (e.g., NGINX) if exposing HTTP hosts
- A ReadWriteMany-capable storage class (for multi-node) or ReadWriteOnce (single-node, e.g., Minikube)

## Configure

All application configuration maps from `.env.example`:

- Non-sensitive keys go under `values.yaml -> env`
- Sensitive keys go under `secretEnv` in a separate `values.secrets.yaml` (do not commit)

Defaults provided by the chart:

- `APP_URL` defaults from the web ingress host
- `WEBSOCKETS_SERVER` defaults to `http(s)://<websockets host>`
- `GOOGLE_REDIRECT_URI` defaults to `<APP_URL>/api/auth/google/callback`

Minimal required secrets:

- `DATABASE_URL` (e.g., `postgresql://user:pass@host:5432/db`)
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (generate with `node tools/generate-server-action-key.js`)
- `DEFAULT_PROVIDER_API_KEY` (for initial OpenAI onboarding)

Ingress hosts (no TLS by default):

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    web: app-latitude.example.com
    gateway: gateway-latitude.example.com
    websockets: ws-latitude.example.com
  tls:
    enabled: false
```

Storage (shared between components):

```yaml
global:
  sharedStorage:
    enabled: true
    size: 10Gi
    accessModes: [ReadWriteMany] # use [ReadWriteOnce] on single-node clusters like Minikube
    storageClass: '' # set to your RWX class (e.g., efs, nfs) or leave empty
```

## Secrets (values.secrets.yaml)

- Create an untracked secrets file: `charts/latitude/values.secrets.yaml`
- Add it to `.gitignore` and `.helmignore` so it is never committed or packaged.
- Example:

```yaml
secretEnv:
  DATABASE_URL: postgresql://user:pass@host:5432/db
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: '<generated-key>'
  DEFAULT_PROVIDER_API_KEY: 'sk-...'
```

- Copy `charts/latitude/values.secrets.yaml.example` to `charts/latitude/values.secrets.yaml` and fill in your values.
- Use it alongside your non-secret values with multiple `-f` flags.
- CI tip: create the file at deploy time from CI secrets and pass it to Helm.

## Install (from source)

```
helm upgrade --install latitude ./charts/latitude \
  --namespace latitude --create-namespace \
  -f charts/latitude/values.yaml \
  -f charts/latitude/values.secrets.yaml
```

A pre-install/upgrade Job runs database migrations.

## Uninstall

```
helm uninstall latitude -n latitude
```

## Published Chart (OCI via GHCR)

This repo includes a GitHub Action that packages and pushes the chart to GHCR as an OCI artifact when you push a tag matching `helm-chart-v*` or run the workflow manually.

- Workflow: `.github/workflows/publish-helm-chart.yml`
- Registry: `ghcr.io/<owner>/latitude`

Install from GHCR (replace `<owner>` and desired version):

```
helm install latitude oci://ghcr.io/<owner>/latitude \
  --version 0.1.0 \
  -n latitude --create-namespace \
  -f charts/latitude/values.yaml \
  -f charts/latitude/values.secrets.yaml
```

To publish a new version via CI:

1. Update `charts/latitude/Chart.yaml` `version:` (e.g., `0.1.1`)
2. Commit and push
3. Tag: `git tag helm-chart-v0.1.1 && git push origin helm-chart-v0.1.1`
4. The workflow will package and push to `ghcr.io/<owner>/latitude:0.1.1`
5. Make the package public in GHCR (first time only): Repository → Packages → latitude → Change visibility to Public

Manual publish (local Helm):

```
# Requires Helm 3.8+ (OCI support) and a PAT with write:packages
helm version

# Login to GHCR
helm registry login ghcr.io -u <github-username> -p <ghcr-personal-access-token>

# Lint and package
helm lint charts/latitude
helm package charts/latitude --destination dist

# Push (tag equals chart version in Chart.yaml)
helm push dist/latitude-<version>.tgz oci://ghcr.io/<owner>

# Install from GHCR
helm install latitude oci://ghcr.io/<owner>/latitude --version <version> -n latitude --create-namespace -f charts/latitude/values.yaml -f charts/latitude/values.secrets.yaml
```

Notes:

- `<owner>` is your GitHub org or username
- The CI workflow uses `${{ secrets.GITHUB_TOKEN }}` and publishes under the repo owner
- You do not need `helm repo add` for OCI charts

## Local Testing with Minikube

Below is a quick path to test everything locally.

1. Start Minikube and enable Ingress

```
minikube start
minikube addons enable ingress
```

2. Install PostgreSQL and Redis (Bitnami)

```
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# PostgreSQL
helm upgrade --install pg bitnami/postgresql -n latitude --create-namespace \
  --set auth.enablePostgresUser=true \
  --set auth.username=latitude \
  --set auth.password=secret \
  --set auth.database=latitude_production

# Redis (no auth for simplicity)
helm upgrade --install redis bitnami/redis -n latitude \
  --set architecture=standalone \
  --set auth.enabled=false
```

Service names (verify with `kubectl get svc -n latitude`):

- PostgreSQL: `pg-postgresql`
- Redis: `redis-master`

3. Prepare values (minikube-values.yaml)

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    web: app-latitude.local
    gateway: gateway-latitude.local
    websockets: ws-latitude.local
  tls:
    enabled: false

global:
  sharedStorage:
    accessModes: [ReadWriteOnce] # Minikube (single node)
    storageClass: standard

env:
  NODE_ENV: production
  QUEUE_HOST: redis-master
  CACHE_HOST: redis-master
  QUEUE_PORT: '6379'
  CACHE_PORT: '6379'
  GATEWAY_BIND_ADDRESS: 0.0.0.0
  GATEWAY_BIND_PORT: '8787'
  GATEWAY_HOSTNAME: gateway
  GATEWAY_PORT: '8080'
  GATEWAY_SSL: 'false'

secretEnv:
  DATABASE_URL: postgresql://latitude:secret@pg-postgresql.latitude.svc.cluster.local:5432/latitude_production
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: '<paste-generated-key>'
  DEFAULT_PROVIDER_API_KEY: 'sk-fake'
```

Generate the encryption key:

```
node tools/generate-server-action-key.js
```

4. Install Latitude

```
helm upgrade --install latitude ./charts/latitude -n latitude -f minikube-values.yaml
```

5. Map hosts to Minikube IP

```
MINIKUBE_IP=$(minikube ip)
echo "$MINIKUBE_IP app-latitude.local gateway-latitude.local ws-latitude.local" | sudo tee -a /etc/hosts
```

6. Open the app

- Web: http://app-latitude.local
- Gateway: http://gateway-latitude.local
- WebSockets: http://ws-latitude.local

## Troubleshooting

- Pods not starting: `kubectl describe pod <name> -n latitude`
- Env issues: check ConfigMap/Secret names `latitude-<release>-env` and `latitude-<release>-env-secrets`
- Ingress 404: ensure `minikube addons enable ingress`, hosts point to `minikube ip`, and `ingress.className: nginx`
- Storage mount errors on Minikube: switch `accessModes` to `[ReadWriteOnce]`

## Values Reference

See `values.yaml` in this chart for all tunables (replicas, resources, imagePullSecrets, ingress, storage, env/secretEnv).
