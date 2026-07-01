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

| Service   | Health Check  | Description                                                               |
| --------- | ------------- | ------------------------------------------------------------------------- |
| web       | `/api/health` | TanStack Start SSR app                                                    |
| api       | `/health`     | Hono public API                                                           |
| ingest    | `/health`     | Hono telemetry ingestion                                                  |
| workers   | `/health`     | BullMQ background workers (no ALB, internal health only)                  |
| workflows | `/health`     | Temporal worker → **Temporal Cloud** (API key in Secrets Manager; no ALB) |

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
    ├── alb.ts               # ALB + listeners + blue/green target groups
    ├── codedeploy.ts        # CodeDeploy app + deployment groups
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

## Deployments

ALB-fronted services (`web`, `api`, `ingest`, `workers`) use **AWS CodeDeploy blue/green** deployments. Each service has paired blue and green target groups; CodeDeploy shifts production traffic to the green group only after new tasks pass health checks, then drains the blue tasks after a short wait. `workflows` has no ALB and keeps ECS rolling deployments.

Pulumi provisions:

- Green target groups alongside existing blue groups (`lat-{prod|stg}-{service}-grn`)
- ECS services with `deploymentController: CODE_DEPLOY` for ALB-backed services
- `healthCheckGracePeriodSeconds: 120` so tasks can warm up before ALB health checks count
- A CodeDeploy application (`latitude-{env}-codedeploy`) and per-service deployment groups

GitHub Actions (`scripts/deploy-ecs-service.sh`) registers a new task definition revision, then calls `aws deploy create-deployment` with an AppSpec for CodeDeploy-managed services. `workflows` still uses `ecs update-service`.

**Rollout order:** apply the Pulumi changes first (`pulumi up`) so green target groups, CodeDeploy resources, and the `CODE_DEPLOY` controller exist before the updated deploy workflow runs. The first CodeDeploy deployment after migration may replace ECS service wiring; plan a maintenance window if needed.

## CI/CD

GitHub Actions workflows:

- `.github/workflows/deploy.yml` - Build and deploy pipeline
- `.github/workflows/build-images.yml` - Build and push container images to GHCR

Deployment triggers:

- **Staging**: push to `development` → build → migrate → deploy
- **Production**: push to `main` → checks pass → build → migrate → deploy
- **Manual**: workflow_dispatch with environment selector

### Production Deployment Details

To deploy to production:

1. **Promote `development` into `main`**: open a PR from `development` to `main` and merge it after review.

2. **Ensure all checks pass**: The deployment workflow requires the CI jobs to succeed. This includes:
   - Type checking (`pnpm typecheck`)
   - Formatting and lint checks (`pnpm check`)
   - Tests (`pnpm test`)

3. **Merge to `main`**:

   ```bash
   gh pr create --base main --head development --fill
   ```

   Merging the PR triggers the production deployment automatically.

4. **Monitor the deployment**: The workflow will:
   - Run all checks in parallel
   - Build and push container images to GHCR
   - Execute database migrations via ECS task
   - Deploy ALB-fronted services via CodeDeploy blue/green; deploy `workflows` via ECS rolling update

5. **Verify deployment**: Check service health via their endpoints:
   - `https://console.latitude.so/api/health`
   - `https://api.latitude.so/health`
   - `https://ingest.latitude.so/health`

Manual deployments must be dispatched from the matching branch:

- Dispatch from `development` when deploying to the `staging` environment
- Dispatch from `main` when deploying to the `production` environment

The deployment workflow uses GitHub Actions OIDC authentication (no long-lived AWS access keys). Each GitHub Environment must define `AWS_DEPLOY_ROLE_ARN` as an environment variable (not a secret), pointing at the Pulumi output `outputs.githubActionsRoleArn` for the matching stack. Keep any legacy deployment IAM user in place until both staging and production deployments have been verified with the new role, then retire the user manually.

## Hex read-only DB access (production)

Hex SaaS reaches Aurora via an SSH tunnel through the existing admin bastion. SSH ingress is scoped to Hex's published egress CIDRs, and the bastion-side `hex` user is restricted to forwarding to the Aurora reader endpoint only.

**1. Get the inputs from Hex** (Workspace → Settings → Connections → "New SSH connection"):

   - SSH public key Hex generated for this workspace
   - Hex's published egress IP CIDRs

**2. Set Pulumi config and deploy:**

   ```bash
   pulumi config set --secret hexSshPublicKey "ssh-ed25519 AAAA... hex-workspace" --stack production
   pulumi config set --plaintext hexEgressCidrs '["1.2.3.4/32","5.6.7.8/32"]' --stack production
   pulumi up --stack production
   ```

   The bastion will be **replaced** (userData change) and will come up with a new public IP. Note the `bastionPublicIp`, `rdsReaderEndpoint`, and `hexReadonlySecretArn` outputs.

**3. Create the Postgres role** (one-off, via SSM Session Manager to the bastion):

   ```bash
   # From the bastion:
   PW=$(aws secretsmanager get-secret-value --secret-id "$(pulumi stack output hexReadonlySecretArn)" --query SecretString --output text | jq -r 'capture("hex_readonly:(?<pw>[^@]+)@").pw')
   ADMIN_URL=$(aws secretsmanager get-secret-value --secret-id latitude-production-admin-database-url --query SecretString --output text)
   psql "$ADMIN_URL" <<SQL
   CREATE ROLE hex_readonly WITH LOGIN PASSWORD '$PW';
   GRANT pg_read_all_data TO hex_readonly;
   ALTER ROLE hex_readonly SET default_transaction_read_only = on;
   ALTER ROLE hex_readonly SET statement_timeout = '5min';
   ALTER ROLE hex_readonly SET idle_in_transaction_session_timeout = '1min';
   SQL
   ```

**4. Configure the Hex data source:**

   - SSH host: `bastionPublicIp` output, user `hex`, port 22
   - DB host: `rdsReaderEndpoint` output, port 5432
   - DB user: `hex_readonly`, password from the `hexReadonlySecretArn` secret
   - DB name: `latitude`, SSL required

To unwire Hex access entirely: `pulumi config rm hexSshPublicKey hexEgressCidrs --stack production && pulumi up` — bastion goes back to SSM-only and the `hex_readonly` Postgres role can be `DROP ROLE`ed at leisure.

## Secret lifecycle

- `better-auth-secret` and `encryption-key` are treated as long-lived immutable secrets in Pulumi.
- Routine `pulumi up` runs do not rotate these values, preventing deployment-driven session invalidation and API key decryption breakage.
- To rotate either value, perform an explicit Secrets Manager rotation/change as a planned operation.
