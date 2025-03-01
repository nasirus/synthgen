# Deployment Guide for SynthGen

This guide explains how to build, push, and deploy the SynthGen services using Docker Hub.

## Prerequisites

- Docker installed on your machine
- Docker Hub account
- Docker logged in to your account

## Building and Pushing Images to Docker Hub

### Linux/macOS

1. Make the deployment script executable:

```bash
chmod +x deploy_images.sh
```

2. Run the deployment script with your Docker Hub username:

```bash
DOCKER_USERNAME=your-dockerhub-username IMAGE_VERSION=1.0.0 ./deploy_images.sh
```

### Windows

#### Using PowerShell

Run the PowerShell script with your Docker Hub username:

```powershell
.\deploy_images.ps1 -DOCKER_USERNAME your-dockerhub-username -IMAGE_VERSION 1.0.0
```

#### Using Command Prompt

Run the batch file with your Docker Hub username:

```cmd
deploy_images.bat your-dockerhub-username 1.0.0
```

These scripts will:
- Build the API, Consumer, and Worker images
- Tag them with your Docker Hub username and specified version
- Push them to Docker Hub

## Deploying with Docker Compose

1. Update the `.env` file with your Docker Hub username and desired image version:

```
DOCKER_USERNAME=your-dockerhub-username
IMAGE_VERSION=1.0.0
```

2. Start the services using docker-compose:

```bash
docker-compose up -d
```

This will pull the images from Docker Hub and start all services.

## Scaling Services

You can adjust the number of consumer and worker instances by modifying the `.env` file:

```
NUM_CONSUMERS=2
NUM_WORKERS=3
```

Then restart the services:

```bash
docker-compose up -d
```

## CI/CD Integration

For automated deployments, you can integrate the deployment scripts into your CI/CD pipeline:

1. Set the `DOCKER_USERNAME` and `DOCKER_PASSWORD` as secrets in your CI/CD environment
2. Run the script as part of your deployment process
3. Use docker-compose to deploy the updated images

Example GitHub Actions workflow:

```yaml
name: Build and Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      
      - name: Build and push images
        run: |
          chmod +x deploy_images.sh
          DOCKER_USERNAME=${{ secrets.DOCKER_USERNAME }} IMAGE_VERSION=${GITHUB_SHA::7} ./deploy_images.sh
``` 