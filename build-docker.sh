#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
VERSION="1.0.0"
IMAGE_NAME="fintool"
REGISTRY=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  -v, --version VERSION    Set version tag (default: 1.0.0)"
            echo "  -r, --registry REGISTRY  Docker registry URL"
            echo "  -n, --name NAME         Image name (default: fintool)"
            echo "  -h, --help              Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}Building FinTool Docker Image${NC}"
echo "Version: $VERSION"
echo "Image: $IMAGE_NAME"
if [ -n "$REGISTRY" ]; then
    echo "Registry: $REGISTRY"
fi
echo ""

# Build the image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -f Dockerfile.prod -t ${IMAGE_NAME}:${VERSION} -t ${IMAGE_NAME}:latest .

# Tag for registry if specified
if [ -n "$REGISTRY" ]; then
    echo -e "${YELLOW}Tagging for registry...${NC}"
    docker tag ${IMAGE_NAME}:${VERSION} ${REGISTRY}/${IMAGE_NAME}:${VERSION}
    docker tag ${IMAGE_NAME}:latest ${REGISTRY}/${IMAGE_NAME}:latest
fi

# Show image size
echo -e "${GREEN}Build complete!${NC}"
docker images ${IMAGE_NAME}

# Save to tar file
echo -e "${YELLOW}Saving image to tar file...${NC}"
docker save ${IMAGE_NAME}:latest | gzip > ${IMAGE_NAME}-${VERSION}.tar.gz
ls -lh ${IMAGE_NAME}-${VERSION}.tar.gz

echo -e "${GREEN}Done!${NC}"
echo ""
echo "To load this image on another system:"
echo "  docker load < ${IMAGE_NAME}-${VERSION}.tar.gz"
echo ""
echo "To push to registry:"
if [ -n "$REGISTRY" ]; then
    echo "  docker push ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
    echo "  docker push ${REGISTRY}/${IMAGE_NAME}:latest"
else
    echo "  docker push ${IMAGE_NAME}:${VERSION}"
    echo "  docker push ${IMAGE_NAME}:latest"
fi