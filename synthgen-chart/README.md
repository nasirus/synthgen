# Synthgen Helm Chart

This Helm chart deploys the Synthgen framework for processing LLM calls to generate synthetic data, with all its components:

- RabbitMQ for message brokering
- FastAPI web framework for the API
- Elasticsearch (using ECK operator) for database
- Rust-based consumer for messages
- NextJS and shadcn UI for monitoring

## Prerequisites

- Kubernetes cluster
- Helm v3
- [Elastic Cloud on Kubernetes (ECK) operator](https://www.elastic.co/guide/en/cloud-on-k8s/current/k8s-overview.html)

## Installing ECK Operator

Before deploying this chart, you need to install the ECK operator:

```bash
# Install custom resource definitions
kubectl create -f https://download.elastic.co/downloads/eck/2.16.1/crds.yaml

# Install the operator with its RBAC rules
kubectl apply -f https://download.elastic.co/downloads/eck/2.16.1/operator.yaml

# Monitor the operator's setup (optional)
kubectl -n elastic-system logs -f statefulset.apps/elastic-operator
```

## Installing the Chart

```bash
# Clone the repository (if you haven't already)
git clone <repository-url>
cd synthgen-chart

# Install the chart with the release name "synthgen"
helm install synthgen .
```

## Configuration

See the [values.yaml](values.yaml) file for configuration options.

## Accessing Services

After the deployment is complete, you can access the services:

### UI
```bash
# If using NodePort
http://<node-ip>:30080

# If using Ingress
http://synthgen.local
```

### API
```bash
# If using NodePort
http://<node-ip>:30081

# If using Ingress
http://synthgen.local/api
```

### Elasticsearch
```bash
# Get Elasticsearch password
PASSWORD=$(kubectl get secret synthgen-elasticsearch-es-elastic-user -o go-template='{{.data.elastic | base64decode}}')

# Forward port
kubectl port-forward svc/synthgen-elasticsearch-http 9200:9200

# Access Elasticsearch
curl -u "elastic:$PASSWORD" -k "https://localhost:9200"
```

### RabbitMQ Management Console
```bash
kubectl port-forward svc/synthgen-rabbitmq 15672:15672
# Visit http://localhost:15672
```

### Minio Console
```bash
kubectl port-forward svc/synthgen-minio 9001:9001
# Visit http://localhost:9001
```

## Uninstalling the Chart

```bash
helm uninstall synthgen
```

## Notes

- The ECK operator manages the Elasticsearch cluster
- Default credentials for Elasticsearch are stored in a Kubernetes secret
- For production use, adjust resource limits and enable persistence as needed 