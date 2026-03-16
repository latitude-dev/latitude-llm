# Kind Local Testing Environment

This directory contains configuration and scripts for running the Latitude LLM platform locally using [kind](https://kind.sigs.k8s.io/) (Kubernetes in Docker).

## Overview

The kind cluster provides a local Kubernetes environment for testing the Helm chart and Docker images before deploying to production. It includes:

- A 3-node Kubernetes cluster (1 control plane, 2 workers)
- Local container registry for fast image development
- All required dependencies (Postgres, ClickHouse, Redis, Redpanda)
- Port mappings for easy local access

## Prerequisites

- [kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) installed
- [kubectl](https://kubernetes.io/docs/tasks/tools/) installed
- [Helm](https://helm.sh/docs/intro/install/) installed
- Docker running

## Quick Start

### 1. Create the Cluster

```bash
./setup.sh
```

This script will:
- Create a kind cluster named "latitude"
- Set up a local container registry at `localhost:5001`
- Deploy all dependencies (Postgres, ClickHouse, Redis, Redpanda)
- Install the Helm chart with local values

### 2. Verify the Deployment

```bash
kubectl get pods -n latitude
```

You should see all services running:
- `latitude-api-*` - API service
- `latitude-ingest-*` - Ingest service
- `latitude-workers-*` - Workers service
- `latitude-web-*` - Web service
- `latitude-postgres-*` - Postgres database
- `latitude-clickhouse-*` - ClickHouse database
- `latitude-redis-*` - Redis cache
- `latitude-redpanda-*` - Kafka-compatible message queue

### 3. Test the Services

Port forward to test locally:

```bash
# API
kubectl port-forward svc/latitude-api 3001:80 -n latitude
curl http://localhost:3001/health

# Ingest
kubectl port-forward svc/latitude-ingest 3002:80 -n latitude
curl http://localhost:3002/health
```

## Architecture

### Cluster Configuration (`cluster-config.yaml`)

The cluster consists of:
- **Control plane node**: Runs Kubernetes control plane components
- **Worker nodes (2)**: Run application workloads
- **Local registry**: `localhost:5001` for fast image iteration

Port mappings:
- `3000` → Web UI
- `3001` → API
- `3002` → Ingest
- `5001` → Local container registry

### Dependencies (`dependencies.yaml`)

Services deployed directly to Kubernetes (not via Helm):

| Service | Port | Purpose |
|---------|------|---------|
| Postgres | 5432 | Application database |
| ClickHouse | 8123 | Analytics/telemetry storage |
| Redis | 6379 | Cache and session store |
| Redpanda | 9092 | Kafka-compatible message queue |

### Helm Values (`values-kind.yaml`)

Overrides for local development:
- Uses `NodePort` services for direct access
- Inline secrets (not secure, for dev only)
- Disabled ingress
- Single replica for each service
- Migrations disabled by default

## Development Workflow

### Building and Pushing Images

```bash
# Build API image
docker build --target api -t localhost:5001/latitude-llm-api:latest .
docker push localhost:5001/latitude-llm-api:latest

# Build other services
docker build --target ingest -t localhost:5001/latitude-llm-ingest:latest .
docker build --target workers -t localhost:5001/latitude-llm-workers:latest .
docker build --target web -t localhost:5001/latitude-llm-web:latest .
```

### Testing Individual Images

```bash
./test-images.sh
```

This script tests each image locally before deploying to the cluster.

### Redeploying After Changes

```bash
# Restart deployments to pull new images
kubectl rollout restart deployment/latitude-api -n latitude
kubectl rollout restart deployment/latitude-ingest -n latitude
kubectl rollout restart deployment/latitude-workers -n latitude
kubectl rollout restart deployment/latitude-web -n latitude
```

### Running Migrations

```bash
# Enable migrations in Helm values
helm upgrade latitude ../charts/latitude -f values-kind.yaml -n latitude --set migrations.enabled=true
```

## Troubleshooting

### Check Pod Logs

```bash
kubectl logs deployment/latitude-api -n latitude --tail=50
```

### Describe Pod for Events

```bash
kubectl describe pod <pod-name> -n latitude
```

### Port Forward for Debugging

```bash
kubectl port-forward svc/latitude-api 3001:80 -n latitude
```

### Reset Everything

```bash
# Delete and recreate cluster
kind delete cluster --name latitude
./setup.sh
```

## Cleanup

Delete the entire cluster:

```bash
kind delete cluster --name latitude
```

Or delete all kind clusters:

```bash
kind delete clusters --all
```

## Files Reference

| File | Purpose |
|------|---------|
| `cluster-config.yaml` | Kind cluster configuration |
| `dependencies.yaml` | Kubernetes manifests for dependencies |
| `setup.sh` | Automated setup script |
| `test-images.sh` | Local image testing script |
| `values-kind.yaml` | Helm values for local deployment |

## Notes

- The local registry at `localhost:5001` is ephemeral - images are lost when the cluster is deleted
- Dependencies are deployed as Kubernetes manifests, not via Helm
- Health checks use `/health` endpoints for API and Ingest services
- Web service probes are configured to use root path `/` instead of `/api/health`
