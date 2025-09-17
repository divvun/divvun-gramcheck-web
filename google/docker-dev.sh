#!/bin/bash

# Docker development script for Google Docs add-on
# This script provides common development commands using Docker

set -e

CONTAINER_NAME="divvun-google-docs-dev"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if container is running
is_container_running() {
    docker ps --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"
}

# Function to check if container exists (running or stopped)
container_exists() {
    docker ps -a --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"
}

# Function to build/rebuild the Docker image
rebuild_image() {
    print_status "Rebuilding Docker image..."

    # Stop and remove container if it exists
    if container_exists; then
        print_status "Stopping and removing existing container..."
        docker-compose down
    fi

    # Remove existing image
    if docker images | grep -q "google_google-docs-dev"; then
        print_status "Removing existing image..."
        docker rmi google_google-docs-dev
    fi

    # Build new image
    print_status "Building new image..."
    docker-compose build --no-cache

    print_status "Image rebuilt successfully!"
}

# Function to start the development environment
start_dev() {
    print_status "Starting Google Docs add-on development environment..."

    if is_container_running; then
        print_warning "Container is already running"
        return 0
    fi

    if container_exists; then
        print_status "Starting existing container..."
        docker start "$CONTAINER_NAME"
    else
        print_status "Creating and starting new container..."
        docker-compose up -d
    fi

    print_status "Development environment is ready!"
    print_status "Run './docker-dev.sh shell' to access the container"
}

# Function to stop the development environment
stop_dev() {
    print_status "Stopping development environment..."
    if is_container_running; then
        docker stop "$CONTAINER_NAME"
        print_status "Container stopped"
    else
        print_warning "Container is not running"
    fi
}

# Function to access shell in container
shell_access() {
    if ! is_container_running; then
        print_error "Container is not running. Start it first with './docker-dev.sh start'"
        exit 1
    fi

    print_status "Accessing container shell..."
    docker exec -it "$CONTAINER_NAME" bash
}

# Function to run clasp commands
run_clasp() {
    if ! is_container_running; then
        print_error "Container is not running. Start it first with './docker-dev.sh start'"
        exit 1
    fi

    # Special handling for login command
    if [ "$1" = "login" ]; then
        print_status "Running clasp login with OAuth support..."
        print_status "This will open a browser window for Google authentication"
        print_status "The OAuth callback will work because we're using host networking"

        # Ensure the clasp directory exists on the host
        mkdir -p ~/.clasp
    else
        print_status "Running clasp $*"
    fi

    docker exec -it "$CONTAINER_NAME" clasp "$@"
}

# Function to run npm commands
run_npm() {
    if ! is_container_running; then
        print_error "Container is not running. Start it first with './docker-dev.sh start'"
        exit 1
    fi

    print_status "Running npm $*"
    docker exec -it "$CONTAINER_NAME" npm "$@"
}

# Function to clean up everything
cleanup() {
    print_status "Cleaning up Docker resources..."
    if container_exists; then
        docker-compose down
        print_status "Container removed"
    fi

    if docker images | grep -q "google_google-docs-dev"; then
        docker rmi google_google-docs-dev
        print_status "Image removed"
    fi
}

# Function to show logs
show_logs() {
    if container_exists; then
        docker logs "$CONTAINER_NAME"
    else
        print_error "Container does not exist"
        exit 1
    fi
}

# Function to show help
show_help() {
    echo "Docker development script for Google Docs add-on"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start         Start the development environment"
    echo "  stop          Stop the development environment"
    echo "  rebuild       Rebuild Docker image (use after Dockerfile changes)"
    echo "  shell         Access container shell"
    echo "  clasp [args]  Run clasp command in container"
    echo "  npm [args]    Run npm command in container"
    echo "  logs          Show container logs"
    echo "  cleanup       Remove container and image"
    echo "  help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start development environment"
    echo "  $0 rebuild                  # Rebuild image after Dockerfile changes"
    echo "  $0 clasp login             # Login to Google Apps Script"
    echo "  $0 clasp push              # Push code to Apps Script"
    echo "  $0 npm install             # Install dependencies"
    echo ""
}

# Main script logic
case "$1" in
    start)
        start_dev
        ;;
    stop)
        stop_dev
        ;;
    rebuild)
        rebuild_image
        ;;
    shell)
        shell_access
        ;;
    clasp)
        shift
        run_clasp "$@"
        ;;
    npm)
        shift
        run_npm "$@"
        ;;
    logs)
        show_logs
        ;;
    cleanup)
        cleanup
        ;;
    help|--help|-h)
        show_help
        ;;
    "")
        print_warning "No command specified"
        show_help
        exit 1
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac