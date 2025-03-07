# Synthgen Helm Chart

This Helm chart deploys the Synthetic Data Generation Framework on Kubernetes.

## Components

The chart deploys the following components:

- **RabbitMQ**: Message broker for communication between components
- **API**: FastAPI web service that provides the API for the framework
- **UI**: NextJS web application for monitoring the framework
- **Consumer**: Rust-based consumer for processing messages
- **Minio**: Object storage for storing generated data
- **Worker**: Python-based worker for processing tasks
- **Elasticsearch**: Database for storing metadata
- **LiteLLM**: LLM service for generating synthetic data

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- PV provisioner support in the underlying infrastructure (if persistence is enabled)

## Installation

```bash
# Add the chart repository
helm repo add synthgen https://synthgen.io/charts
helm repo update

# Install the chart
helm install synthgen synthgen/synthgen
```

To install the chart with a custom release name and namespace:

```bash
helm install my-release synthgen/synthgen -n my-namespace
```

## Configuration

See `values.yaml` for the full list of configurable parameters.

### Required Values

At a minimum, you should configure:

- `global.storageClass`: The storage class to use for persistent volumes
- `api.env.API_SECRET_KEY`: Secret key for API authentication

### Optional Values

You can customize the deployment by setting additional values:

- `rabbitmq.service.type`: Service type for RabbitMQ (default: ClusterIP)
- `rabbitmq.persistence.enabled`: Enable persistence for RabbitMQ (default: true)
- `elasticsearch.persistence.enabled`: Enable persistence for Elasticsearch (default: true)
- `minio.persistence.enabled`: Enable persistence for Minio (default: true)
- `ingress.enabled`: Enable ingress for UI and API (default: true)

### Scaling the Services

To scale the services, you can set the number of replicas:

```bash
helm upgrade synthgen synthgen/synthgen --set worker.replicas=3 --set consumer.replicas=2
```

## Uninstallation

To uninstall the chart:

```bash
helm uninstall synthgen
```

## Persistence

The chart supports persistence for RabbitMQ, Elasticsearch, and Minio data. 
To enable persistence, set the corresponding persistence.enabled value to true.

## Accessing Services

Once the chart is deployed, you can access the services using port-forwarding:

```bash
# Access the UI
kubectl port-forward svc/synthgen-ui 3000:3000

# Access the API
kubectl port-forward svc/synthgen-api 8000:8000

# Access RabbitMQ management console
kubectl port-forward svc/synthgen-rabbitmq 15672:15672

# Access Minio console
kubectl port-forward svc/synthgen-minio 9001:9001
```

If ingress is enabled, you can access the UI and API through the configured host. 

## Storage Class Handling

This chart includes automatic storage class detection and fallback mechanisms to make it work across different Kubernetes environments:

1. If a `standard` storage class exists, it will be used
2. If no `standard` storage class exists but `hostpath` exists, the chart will create a `standard` storage class that uses the `hostpath` provisioner
3. If neither exists, the chart creates a `standard` storage class with static PersistentVolumes for each component

This makes the chart work out-of-the-box in most environments, including:
- Docker Desktop Kubernetes
- Minikube
- Kind
- Cloud providers (which typically have their own `standard` storage class)

You can override this behavior by setting `global.storageClass` to specify a particular storage class:

```bash
helm install synthgen ./synthgen-chart --set global.storageClass=your-storage-class
``` 