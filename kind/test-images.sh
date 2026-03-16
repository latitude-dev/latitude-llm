#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}=== Building Individual Docker Images ===${NC}"
echo ""

# Test API image
echo -e "${YELLOW}Building API image...${NC}"
docker build --target api -t "latitude-llm-api:latest" "${SCRIPT_DIR}/.."
echo -e "${GREEN}API image built successfully!${NC}"
echo ""

# Test Ingest image
echo -e "${YELLOW}Building Ingest image...${NC}"
docker build --target ingest -t "latitude-llm-ingest:latest" "${SCRIPT_DIR}/.."
echo -e "${GREEN}Ingest image built successfully!${NC}"
echo ""

# Test Workers image
echo -e "${YELLOW}Building Workers image...${NC}"
docker build --target workers -t "latitude-llm-workers:latest" "${SCRIPT_DIR}/.."
echo -e "${GREEN}Workers image built successfully!${NC}"
echo ""

# Test Web image
echo -e "${YELLOW}Building Web image...${NC}"
docker build --target web \
    --build-arg VITE_LAT_API_URL="http://localhost:3001" \
    --build-arg VITE_LAT_WEB_URL="http://localhost:3000" \
    -t "latitude-llm-web:latest" "${SCRIPT_DIR}/.."
echo -e "${GREEN}Web image built successfully!${NC}"
echo ""

# Test Migrations image
echo -e "${YELLOW}Building Migrations image...${NC}"
docker build --target migrations -t "latitude-llm-migrations:latest" "${SCRIPT_DIR}/.."
echo -e "${GREEN}Migrations image built successfully!${NC}"
echo ""

# Show image sizes
echo -e "${BLUE}=== Image Sizes ===${NC}"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep "latitude-llm"
echo ""

echo -e "${GREEN}=== All images built successfully! ===${NC}"
