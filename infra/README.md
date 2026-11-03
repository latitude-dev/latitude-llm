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

5. **Preview retained staging audit resources:**

   ```bash
   pulumi preview --stack staging
   ```

   The staging application is retired by default. Follow [the deployment guide](../dev-docs/deployment.md) to restore it.

6. **Preview production infrastructure:**

   ```bash
   pulumi preview --stack production
   ```

   Apply infrastructure changes manually from the operator host only after a clean preview and approval.

## Architecture

### Staging

The application resources are retired. The stack retains account-wide CloudTrail, AWS Config, GuardDuty, and audit storage. Do not destroy the whole staging stack. Set `retireApplication=false` and restore task counts only as part of an approved manual restart.

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

[The deployment guide](../dev-docs/deployment.md) defines the release and infrastructure procedures. `development` is trunk. Staging builds and deployments require `STAGING_DEPLOYMENTS_ENABLED=true`; leave the variable off while the staging application is retired. Production uses release tags, with checks, type checks, and tests before deployment. Do not promote through `main`.

Application deployment uses GitHub Actions OIDC. The production GitHub Environment defines `AWS_DEPLOY_ROLE_ARN` using the matching Pulumi output. Infrastructure applies are manual host operations.

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
