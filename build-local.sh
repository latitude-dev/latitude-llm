#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print step with color
print_step() {
    echo -e "${BLUE}==> $1${NC}"
}

# Check for required tools
check_requirements() {
    print_step "Checking requirements..."
    
    command -v node >/dev/null 2>&1 || { echo -e "${RED}Node.js is required but not installed.${NC}" >&2; exit 1; }
    command -v pnpm >/dev/null 2>&1 || { echo -e "${RED}pnpm is required but not installed.${NC}" >&2; exit 1; }
    command -v turbo >/dev/null 2>&1 || { echo -e "${RED}turbo is required but not installed.${NC}" >&2; exit 1; }
}

# Install dependencies
install_dependencies() {
    print_step "Installing dependencies..."
    
    # Install corepack if not already installed
    if ! command -v corepack >/dev/null 2>&1; then
        npm install -g corepack@0.31.0
        corepack enable
    fi
    
    # Install turbo if not already installed
    if ! command -v turbo >/dev/null 2>&1; then
        pnpm install -g turbo
    fi
}

# Install project dependencies
install_project_dependencies() {
    print_step "Installing project dependencies..."
    pnpm install --frozen-lockfile --filter "@latitude-data/web..."
}

# Build the project
build_project() {
    print_step "Building project..."
    
    # Set required environment variables
    export BUILDING_CONTAINER=true
    export NEXT_TELEMETRY_DISABLED=1
    
    # Build the project using turbo
    BUILDING_CONTAINER=true \
    NEXT_TELEMETRY_DISABLED=1 \
    pnpm turbo build --filter="@latitude-data/web..."
}

# Prune dependencies
prune_dependencies() {
    print_step "Pruning dependencies..."
    pnpm prune --prod --no-optional
}

# Main execution
main() {
    print_step "Starting local build process..."
    
    # Check requirements
    check_requirements
    
    # Install global dependencies
    install_dependencies
    
    # Install project dependencies
    install_project_dependencies
    
    # Build the project
    build_project
    
    # Prune dependencies
    prune_dependencies
    
    print_step "Build completed successfully!"
    echo -e "${GREEN}You can find the build output in apps/web/.next${NC}"
}

# Execute main function
main

