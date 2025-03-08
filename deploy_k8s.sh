#!/bin/bash

# Set default values
RELEASE_NAME="synthgen"
NAMESPACE="default"
VALUES_FILE=""

# Process command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -n|--namespace)
      NAMESPACE="$2"
      shift
      shift
      ;;
    -r|--release)
      RELEASE_NAME="$2"
      shift
      shift
      ;;
    -f|--values)
      VALUES_FILE="$2"
      shift
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check if namespace exists, if not create it
kubectl get namespace "$NAMESPACE" > /dev/null 2>&1 || kubectl create namespace "$NAMESPACE"

# Set up values file argument if provided
VALUES_ARG=""
if [ -n "$VALUES_FILE" ]; then
  if [ -f "$VALUES_FILE" ]; then
    VALUES_ARG="-f $VALUES_FILE"
  else
    echo "Values file not found: $VALUES_FILE"
    exit 1
  fi
fi

# Install the chart
echo "Installing $RELEASE_NAME in namespace $NAMESPACE..."
helm install $RELEASE_NAME ./synthgen-chart $VALUES_ARG --namespace $NAMESPACE

# Check status
echo "Checking deployment status..."
kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME"

echo "Installation complete!"
echo "To get the application URL and other information, run:"
echo "  helm status $RELEASE_NAME -n $NAMESPACE" 