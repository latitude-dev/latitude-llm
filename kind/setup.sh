#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLUSTER_NAME="latitude"
REGISTRY_NAME="kind-registry"
REGISTRY_PORT="5001"
NAMESPACE="latitude"

echo -e "${BLUE}=== Latitude Helm Chart - Kind Local Testing ===${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"
if ! command_exists kind; then
    echo -e "${RED}kind is not installed. Install it first:${NC}"
    echo "  curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.24.0/kind-linux-amd64"
    echo "  chmod +x ./kind && sudo mv ./kind /usr/local/bin/"
    exit 1
fi

if ! command_exists helm; then
    echo -e "${RED}helm is not installed. Install it first:${NC}"
    echo "  curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"
    exit 1
fi

if ! command_exists docker; then
    echo -e "${RED}docker is not installed.${NC}"
    exit 1
fi

if ! command_exists kubectl; then
    echo -e "${RED}kubectl is not installed. Install it first:${NC}"
    echo "  https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

echo -e "${GREEN}All prerequisites found!${NC}"
echo ""

# Function to setup local registry
setup_registry() {
    echo -e "${YELLOW}Setting up local Docker registry...${NC}"
    
    # Check if registry is already running
    if docker ps | grep -q "$REGISTRY_NAME"; then
        echo -e "${GREEN}Registry already running${NC}"
    elif docker ps -a | grep -q "$REGISTRY_NAME"; then
        echo "Starting existing registry container..."
        docker start "$REGISTRY_NAME"
    else
        echo "Creating new registry container..."
        docker run -d --restart=always -p "${REGISTRY_PORT}:5000" --name "$REGISTRY_NAME" registry:2
    fi
    
    # Connect registry to kind network if kind cluster exists
    if kind get clusters | grep -q "$CLUSTER_NAME"; then
        echo "Connecting registry to kind network..."
        docker network connect "kind" "$REGISTRY_NAME" 2>/dev/null || true
    fi
    
    echo -e "${GREEN}Registry ready at localhost:${REGISTRY_PORT}${NC}"
}

# Function to create kind cluster
create_cluster() {
    echo -e "${YELLOW}Creating kind cluster '${CLUSTER_NAME}'...${NC}"
    
    if kind get clusters | grep -q "$CLUSTER_NAME"; then
        echo -e "${YELLOW}Cluster already exists. Delete it first with: kind delete cluster --name $CLUSTER_NAME${NC}"
        read -p "Delete and recreate? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kind delete cluster --name "$CLUSTER_NAME"
        else
            echo "Using existing cluster..."
            return
        fi
    fi
    
    kind create cluster --name "$CLUSTER_NAME" --config "${SCRIPT_DIR}/cluster-config.yaml"
    
    # Connect registry to kind network
    docker network connect "kind" "$REGISTRY_NAME" 2>/dev/null || true
    
    echo -e "${GREEN}Cluster created!${NC}"
}

# Function to build and push images
build_images() {
    echo -e "${YELLOW}Building Docker images...${NC}"
    
    cd "${SCRIPT_DIR}/.."
    
    # Get the API URL for the web build
    API_URL="http://localhost:3001"
    WEB_URL="http://localhost:3000"
    
    echo "Building API image..."
    docker build --target api -t "localhost:${REGISTRY_PORT}/latitude-llm-api:latest" .
    docker push "localhost:${REGISTRY_PORT}/latitude-llm-api:latest"
    
    echo "Building Web image..."
    docker build --target web --build-arg VITE_LAT_API_URL="$API_URL" --build-arg VITE_LAT_WEB_URL="$WEB_URL" -t "localhost:${REGISTRY_PORT}/latitude-llm-web:latest" .
    docker push "localhost:${REGISTRY_PORT}/latitude-llm-web:latest"
    
    echo "Building Ingest image..."
    docker build --target ingest -t "localhost:${REGISTRY_PORT}/latitude-llm-ingest:latest" .
    docker push "localhost:${REGISTRY_PORT}/latitude-llm-ingest:latest"
    
    echo "Building Workers image..."
    docker build --target workers -t "localhost:${REGISTRY_PORT}/latitude-llm-workers:latest" .
    docker push "localhost:${REGISTRY_PORT}/latitude-llm-workers:latest"
    
    echo "Building Migrations image..."
    docker build --target migrations -t "localhost:${REGISTRY_PORT}/latitude-llm-migrations:latest" .
    docker push "localhost:${REGISTRY_PORT}/latitude-llm-migrations:latest"
    
    echo -e "${GREEN}All images built and pushed!${NC}"
}

# Function to deploy dependencies
deploy_dependencies() {
    echo -e "${YELLOW}Deploying dependencies (Postgres, Redis, ClickHouse, Redpanda)...${NC}"
    
    # Create namespace
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy dependencies using the provided manifests
    kubectl apply -f "${SCRIPT_DIR}/dependencies.yaml" -n "$NAMESPACE"
    
    echo "Waiting for dependencies to be ready..."
    kubectl wait --for=condition=ready pod -l app=postgres -n "$NAMESPACE" --timeout=120s
    kubectl wait --for=condition=ready pod -l app=redis -n "$NAMESPACE" --timeout=120s
    kubectl wait --for=condition=ready pod -l app=clickhouse -n "$NAMESPACE" --timeout=120s
    kubectl wait --for=condition=ready pod -l app=redpanda -n "$NAMESPACE" --timeout=120s
    
    echo -e "${GREEN}Dependencies ready!${NC}"
}

# Function to deploy the Helm chart
deploy_chart() {
    echo -e "${YELLOW}Deploying Latitude Helm chart...${NC}"
    
    cd "${SCRIPT_DIR}/.."
    
    # Check if release exists
    if helm list -n "$NAMESPACE" | grep -q "latitude"; then
        echo "Upgrading existing release..."
        helm upgrade latitude ./charts/latitude -f "${SCRIPT_DIR}/values-kind.yaml" -n "$NAMESPACE"
    else
        echo "Installing new release..."
        helm install latitude ./charts/latitude -f "${SCRIPT_DIR}/values-kind.yaml" -n "$NAMESPACE"
    fi
    
    echo ""
    echo -e "${GREEN}Helm chart deployed!${NC}"
}

# Function to wait for deployment
wait_for_deployment() {
    echo -e "${YELLOW}Waiting for Latitude services to be ready...${NC}"
    
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=latitude -n "$NAMESPACE" --timeout=300s 2>/dev/null || true
    
    echo ""
    echo -e "${GREEN}Services should be starting up. Check status with:${NC}"
    echo "  kubectl get pods -n $NAMESPACE"
    echo "  kubectl logs -f deployment/latitude-web -n $NAMESPACE"
}

# Function to show status
show_status() {
    echo ""
    echo -e "${BLUE}=== Deployment Status ===${NC}"
    echo ""
    
    echo "Pods:"
    kubectl get pods -n "$NAMESPACE"
    
    echo ""
    echo "Services:"
    kubectl get svc -n "$NAMESPACE"
    
    echo ""
    echo -e "${GREEN}=== Access URLs ===${NC}"
    echo "Web UI:     http://localhost:3000"
    echo "API:        http://localhost:3001"
    echo "Ingest:     http://localhost:3002"
    echo ""
    echo "Health checks:"
    echo "  curl http://localhost:3001/health  # API"
    echo "  curl http://localhost:3002/health  # Ingest"
    echo ""
    echo -e "${YELLOW}Note: Services may take a minute to fully start.${NC}"
}

# Function to show logs
show_logs() {
    echo -e "${YELLOW}Recent logs from all Latitude services:${NC}"
    kubectl logs -l app.kubernetes.io/name=latitude -n "$NAMESPACE" --tail=50 --prefix
}

# Function to cleanup
cleanup() {
    echo -e "${YELLOW}Cleaning up...${NC}"
    
    read -p "Delete kind cluster? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kind delete cluster --name "$CLUSTER_NAME"
        echo -e "${GREEN}Cluster deleted${NC}"
    fi
    
    read -p "Stop local registry? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker stop "$REGISTRY_NAME" 2>/dev/null || true
        echo -e "${GREEN}Registry stopped${NC}"
    fi
}

# Main command handler
case "${1:-all}" in
    registry)
        setup_registry
        ;;
    cluster)
        setup_registry
        create_cluster
        ;;
    build)
        build_images
        ;;
    deps|dependencies)
        deploy_dependencies
        ;;
    deploy)
        deploy_chart
        wait_for_deployment
        show_status
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    cleanup)
        cleanup
        ;;
    all|"")
        setup_registry
        create_cluster
        build_images
        deploy_dependencies
        deploy_chart
        wait_for_deployment
        show_status
        ;;
    *)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  registry       - Setup local Docker registry"
        echo "  cluster        - Create kind cluster"
        echo "  build          - Build and push Docker images"
        echo "  deps           - Deploy dependencies (Postgres, Redis, etc.)"
        echo "  deploy         - Deploy Helm chart"
        echo "  status         - Show deployment status"
        echo "  logs           - Show service logs"
        echo "  cleanup        - Remove cluster and registry"
        echo "  all            - Run full setup (default)"
        echo ""
        echo "Examples:"
        echo "  $0                    # Full setup from scratch"
        echo "  $0 build              # Rebuild images only"
        echo "  $0 deploy             # Redeploy chart"
        echo "  $0 logs               # View logs"
        exit 1
        ;;
esac
