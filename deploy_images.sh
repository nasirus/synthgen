#!/bin/bash

# Exit on error
set -e

# Configuration
DOCKER_USERNAME=${DOCKER_USERNAME:-""}
IMAGE_VERSION=${IMAGE_VERSION:-"latest"}
API_IMAGE_NAME="synthgen-api"
CONSUMER_IMAGE_NAME="synthgen-consumer"
WORKER_IMAGE_NAME="synthgen-worker"

# Check if Docker username is provided
if [ -z "$DOCKER_USERNAME" ]; then
    echo "Error: DOCKER_USERNAME environment variable is not set."
    echo "Usage: DOCKER_USERNAME=yourusername [IMAGE_VERSION=1.0.0] ./deploy_images.sh"
    exit 1
fi

echo "Building and pushing images to Docker Hub as $DOCKER_USERNAME"
echo "Image version: $IMAGE_VERSION"

# Login to Docker Hub
echo "Logging in to Docker Hub..."
docker login -u "$DOCKER_USERNAME"

# Build and push API image
echo "Building API image..."
docker build -t "$DOCKER_USERNAME/$API_IMAGE_NAME:$IMAGE_VERSION" -f Dockerfile.api .
echo "Pushing API image to Docker Hub..."
docker push "$DOCKER_USERNAME/$API_IMAGE_NAME:$IMAGE_VERSION"

# Build and push Consumer image
echo "Building Consumer image..."
docker build -t "$DOCKER_USERNAME/$CONSUMER_IMAGE_NAME:$IMAGE_VERSION" -f Dockerfile.consumer .
echo "Pushing Consumer image to Docker Hub..."
docker push "$DOCKER_USERNAME/$CONSUMER_IMAGE_NAME:$IMAGE_VERSION"

# Build and push Worker image
echo "Building Worker image..."
docker build -t "$DOCKER_USERNAME/$WORKER_IMAGE_NAME:$IMAGE_VERSION" -f Dockerfile.worker .
echo "Pushing Worker image to Docker Hub..."
docker push "$DOCKER_USERNAME/$WORKER_IMAGE_NAME:$IMAGE_VERSION"

echo "All images have been built and pushed to Docker Hub successfully!"
echo "You can now update your docker-compose.yml to use these images."
