# Docker Compose Configurations

This directory contains multiple Docker Compose configurations for different use cases:

## Available Configurations

### 1. `docker-compose.yml` (Default)

- **Purpose**: Production-like setup using pre-built images from GitHub Container Registry
- **Use case**: Quick setup for testing or production deployment
- **Images**: Uses `ghcr.io/latitude-dev/*` images
- **Command**: `docker compose up`

### 2. `docker-compose.local.yml` (Local Build)

- **Purpose**: Build all packages locally from source code
- **Use case**: When you want to build everything locally without pushing to registry
- **Builds**: Uses local Dockerfiles to build all services
- **Command**: `docker compose -f docker-compose.local.yml up --build`

### 3. `docker-compose.dev.yml` (Development)

- **Purpose**: Development environment with hot reload and source code mounting
- **Use case**: Active development with file watching and instant updates
- **Features**:
  - Mounts source code for live editing
  - Runs `pnpm dev` for hot reload
  - Excludes node_modules from mounting for performance
- **Command**: `docker compose -f docker-compose.dev.yml up`

### 4. `docker-compose.prod.yml` (Production)

- **Purpose**: Production deployment with Traefik reverse proxy
- **Use case**: Production environments with SSL/TLS termination
- **Features**: Traefik load balancing, SSL certificates, domain routing
- **Command**: `docker compose -f docker-compose.prod.yml up`

## Quick Start Guide

### For Development (Recommended)

```bash
# Start development environment with hot reload
docker compose -f docker-compose.dev.yml up

# Run in background
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f
```

### For Local Building

```bash
# Build and start all services locally
docker compose -f docker-compose.local.yml up --build

# Build specific service
docker compose -f docker-compose.local.yml build web

# Start without rebuilding
docker compose -f docker-compose.local.yml up
```

### For Production Testing

```bash
# Use pre-built images (fastest)
docker compose up

# Or use production configuration with Traefik
docker compose -f docker-compose.prod.yml up
```

## Service Ports

| Service    | Dev Port | Local/Prod Port | Description           |
| ---------- | -------- | --------------- | --------------------- |
| Web        | 3000     | 3000/8080       | Main web application  |
| Gateway    | 4000     | 4000/8080       | API Gateway           |
| WebSockets | 4002     | 4002/4002       | Real-time connections |
| Database   | 5432     | 5432            | PostgreSQL            |
| Redis      | 6379     | 6379            | Cache/Queue           |
| Mailpit    | 8025     | 8025            | Email testing UI      |
| SMTP       | 1025     | 1025            | Email testing SMTP    |

## Environment Setup

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Configure the required environment variables in `.env`

3. For development, you may also need:

   ```bash
   # Install dependencies locally first
   pnpm install

   # Run database migrations
   pnpm --filter @latitude-data/core db:migrate
   ```

## Development Workflow

### Using Development Configuration

The development configuration (`docker-compose.dev.yml`) is optimized for active development:

1. **Source Code Mounting**: Your local changes are immediately reflected
2. **Hot Reload**: Services restart automatically when files change
3. **Isolated Dependencies**: Each service has its own node_modules
4. **Fast Iteration**: No need to rebuild containers for code changes

### Building Packages Locally

The local configuration (`docker-compose.local.yml`) builds all packages from source:

1. **Full Build**: Builds all packages using the same Dockerfiles as CI/CD
2. **Local Testing**: Test your changes in a containerized environment
3. **No Registry Dependency**: Works offline once images are built
4. **Consistent Environment**: Same build process across all environments

## Troubleshooting

### Port Conflicts

If ports are already in use, modify the port mappings in the compose file or stop conflicting services.

### Build Failures

For local builds, ensure you have:

- Sufficient Docker resources (memory, CPU)
- All required build arguments in your `.env` file
- Clean working directory (no uncommitted changes that might break builds)

### Development Issues

For development mode:

- Ensure `node_modules` directories exist locally
- Check that pnpm is properly installed
- Verify environment variables are correctly set

### Database Connection Issues

- Ensure the database service is fully started before other services
- Check database logs: `docker compose logs db`
- Verify connection strings in your `.env` file

## Performance Tips

### Development Mode

- Use volume mounts strategically to avoid slow file syncing
- Exclude `node_modules` from mounting for better performance
- Consider using Docker Desktop's file sharing optimizations

### Local Build Mode

- Use Docker BuildKit for faster builds: `DOCKER_BUILDKIT=1 docker compose build`
- Leverage Docker layer caching by keeping Dockerfiles stable
- Build services in parallel when possible

### General

- Allocate sufficient memory to Docker (at least 4GB recommended)
- Use SSD storage for better I/O performance
- Keep Docker and Docker Compose updated
