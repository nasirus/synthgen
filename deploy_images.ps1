# PowerShell script to build and push Docker images to Docker Hub

# Configuration
param(
    [Parameter(Mandatory = $true)]
    [string]$DOCKER_USERNAME = "nasirus",
    
    [Parameter(Mandatory = $false)]
    [string]$IMAGE_VERSION = "latest"
)

$API_IMAGE_NAME = "synthgen-api"
$CONSUMER_IMAGE_NAME = "synthgen-consumer"
$WORKER_IMAGE_NAME = "synthgen-worker"

Write-Host "Building and pushing images to Docker Hub as $DOCKER_USERNAME"
Write-Host "Image version: $IMAGE_VERSION"

# Login to Docker Hub
Write-Host "Logging in to Docker Hub..."
docker login -u $DOCKER_USERNAME

# Build and push API image
Write-Host "Building API image..."
docker build -t "$DOCKER_USERNAME/$API_IMAGE_NAME`:$IMAGE_VERSION" -f Dockerfile.api .
Write-Host "Pushing API image to Docker Hub..."
docker push "$DOCKER_USERNAME/$API_IMAGE_NAME`:$IMAGE_VERSION"

# Build and push Consumer image
Write-Host "Building Consumer image..."
docker build -t "$DOCKER_USERNAME/$CONSUMER_IMAGE_NAME`:$IMAGE_VERSION" -f Dockerfile.consumer .
Write-Host "Pushing Consumer image to Docker Hub..."
docker push "$DOCKER_USERNAME/$CONSUMER_IMAGE_NAME`:$IMAGE_VERSION"

# Build and push Worker image
Write-Host "Building Worker image..."
docker build -t "$DOCKER_USERNAME/$WORKER_IMAGE_NAME`:$IMAGE_VERSION" -f Dockerfile.worker .
Write-Host "Pushing Worker image to Docker Hub..."
docker push "$DOCKER_USERNAME/$WORKER_IMAGE_NAME`:$IMAGE_VERSION"

Write-Host "All images have been built and pushed to Docker Hub successfully!"
Write-Host "You can now update your docker-compose.yml to use these images." 