# Latitude Infrastructure

AWS infrastructure for the Latitude LLM observability platform using Pulumi (TypeScript).

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/install/)
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- [Node.js 25+](https://nodejs.org/)
- [pnpm](https://pnpm.io/)

## Quick Start

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Configure secrets:**

   ```bash
   pulumi config set hostedZoneId ZXXXXXXXXXXXXXXXXXXX
   pulumi config set githubOwner your-github-owner
   pulumi config set githubRepo your-github-repo
   ```

3. **Create the S3 backend bucket** (one-time setup):

   ```bash
   aws s3 mb s3://latitude-pulumi-state --region eu-central-1
   aws s3api put-bucket-versioning --bucket latitude-pulumi-state --versioning-configuration Status=Enabled
   ```

4. **Initialize stacks:**

   ```bash
   pulumi stack init staging
   pulumi stack init production
   ```

5. **Deploy staging:**

   ```bash
   pulumi up --stack staging
   ```

6. **Deploy production:**

   ```bash
   pulumi up --stack production
   ```

## Architecture

### Staging (Cost-Optimized)

- 2 AZ VPC with fck-nat instance (no NAT gateway)
- RDS PostgreSQL 16 `db.t4g.micro` (standard, single-AZ)
- ElastiCache Redis 7 `cache.t3.micro` (cache + BullMQ)
- ECS Fargate: 1 task per service, no auto-scaling
- Domains: `staging.latitude.so`, `staging-api.latitude.so`, `staging-ingest.latitude.so`

### Production (MVP-Ready)

- 2 AZ VPC with NAT gateway
- Aurora Serverless v2 PostgreSQL 16: 0.5-2 ACU, Multi-AZ
- MemoryDB Redis 7 `db.t4g.small` (cache + BullMQ, 2-node)
- ECS Fargate: Auto-scaling 1-3 tasks per service
- Domains: `console.latitude.so`, `api.latitude.so`, `ingest.latitude.so`

## Services

All services listen on port 8080 inside the container (mapped via ALB target groups).

| Service   | Health Check  | Description                                                                 |
| --------- | ------------- | --------------------------------------------------------------------------- |
| web       | `/api/health` | TanStack Start SSR app                                                      |
| api       | `/health`     | Hono public API                                                             |
| ingest    | `/health`     | Hono telemetry ingestion                                                    |
| workers   | `/health`     | BullMQ background workers (no ALB, internal health only)                    |
| workflows | `/health`     | Temporal worker → **Temporal Cloud** (API key in Secrets Manager; no ALB)   |

Set `latitude-infra:temporalCloudNamespace` (and optionally `temporalCloudAddress` / `temporalTaskQueue`) in `Pulumi.<stack>.yaml`. Put the real Temporal Cloud API key in the `latitude-<env>-temporal-api-key` secret (see `LAT_TEMPORAL_API_KEY` when running `pulumi up` with env vars, or update the secret in AWS).

## File Structure

```
infra/
├── Pulumi.yaml              # Project config
├── Pulumi.staging.yaml      # Staging stack config
├── Pulumi.production.yaml   # Production stack config
├── config.ts                # Environment configurations
├── index.ts                 # Stack entry point
└── lib/
    ├── types.ts             # Pulumi AWS type aliases
    ├── vpc.ts               # VPC, subnets, NAT
    ├── vpc-endpoints.ts     # S3 + Secrets Manager VPC endpoints
    ├── security-groups.ts   # Security group factories
    ├── alb.ts               # ALB + listeners + target groups
    ├── ecs.ts               # ECS cluster + services + migrations task
    ├── rds.ts               # RDS (standard) / Aurora Serverless v2
    ├── redis.ts             # ElastiCache / MemoryDB
    ├── s3.ts                # S3 bucket + lifecycle
    ├── secrets.ts           # Secrets Manager helpers
    ├── dns.ts               # ACM + Route53 records
    ├── bastion.ts           # Bastion instance (Tailscale VPN access)
    ├── github-actions.ts    # OIDC provider + deploy role
    └── observability.ts     # CloudWatch dashboards + alarms
```

## CI/CD

GitHub Actions workflows:

- `.github/workflows/deploy.yml` - Build and deploy pipeline
- `.github/workflows/build-images.yml` - Build and push container images to GHCR

Deployment triggers:

- **Staging**: push to `staging` → build → migrate → deploy
- **Production**: push to `main` → checks pass → build → migrate → deploy
- **Manual**: workflow_dispatch with environment selector

### Production Deployment Details

To deploy to production:

1. **Promote `staging` into `main`**: open a PR from `staging` to `main` and merge it after review.

2. **Ensure all checks pass**: The deployment workflow requires the CI jobs to succeed. This includes:
    - Type checking (`pnpm typecheck`)
    - Formatting and lint checks (`pnpm check`)
    - Tests (`pnpm test`)

3. **Merge to `main`**:
    ```bash
    gh pr create --base main --head staging --fill
    ```

   Merging the PR triggers the production deployment automatically.

4. **Monitor the deployment**: The workflow will:
    - Run all checks in parallel
    - Build and push container images to GHCR
    - Execute database migrations via ECS task
    - Deploy services to ECS Fargate with zero-downtime rolling updates

5. **Verify deployment**: Check service health via their endpoints:
    - `https://console.latitude.so/api/health`
    - `https://api.latitude.so/health`
    - `https://ingest.latitude.so/health`

Manual deployments must be dispatched from the matching branch:

- Dispatch from `staging` when deploying to the `staging` environment
- Dispatch from `main` when deploying to the `production` environment

The deployment workflow uses OIDC authentication (no long-lived AWS credentials).

## Secret lifecycle

- `better-auth-secret` and `encryption-key` are treated as long-lived immutable secrets in Pulumi.
- Routine `pulumi up` runs do not rotate these values, preventing deployment-driven session invalidation and API key decryption breakage.
- To rotate either value, perform an explicit Secrets Manager rotation/change as a planned operation.
