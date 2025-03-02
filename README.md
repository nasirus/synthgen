# SynthGen: High-Performance LLM Inference Framework

SynthGen is a powerful framework designed for high-performance LLM inference and synthetic data generation through parallel processing. Built with a focus on speed, scalability, and observability, SynthGen provides enterprise-grade capabilities for handling large-scale LLM tasks.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Key Features

### ⚡ High-Performance Parallel Processing

- **Distributed Architecture**: Process thousands of LLM inference tasks concurrently across multiple workers
- **Rust-Powered Processing**: Core data processing agent implemented in Rust for maximum throughput and minimal latency
- **Optimized Message Flow**: RabbitMQ-based message broker ensures efficient task distribution and load balancing
- **Parallelism Control**: Configurable parameters for scaling workers based on available compute resources

### 🚀 Advanced Caching System

- **Intelligent Response Caching**: Automatically cache and reuse responses for identical prompts to reduce API costs
- **Distributed Cache**: Elasticsearch-backed caching system ensures cache consistency across all workers
- **Fine-grained Control**: Per-task cache configuration allowing selective caching based on task requirements

### 🔍 Full Observability

- **Comprehensive Metrics**: Monitor token usage, request rates, latency, and throughput in real-time
- **Detailed Logging**: Structured logging with correlation IDs for end-to-end request tracking
- **Performance Dashboards**: Built-in metrics visualization for system performance analysis
- **Task Tracing**: Full visibility into the lifecycle of each LLM task from submission to completion

### 🔧 Rust-Powered Consumer

- **High-Efficiency Agent**: Core data processing implemented in Rust for optimal performance
- **Memory Safety**: Leverage Rust's memory safety guarantees while maintaining high throughput
- **Low Overhead**: Minimal CPU and memory footprint compared to traditional Python consumers
- **Async Processing**: Non-blocking architecture for maximum throughput and resource utilization
- **Native Extensions**: Easy extension points for custom Rust modules to handle specialized processing needs

### 🔌 Flexible Integration

- **Modern API**: FastAPI-based REST interface with comprehensive OpenAPI documentation
- **Client Libraries**: Official Python client library with async support and rich error handling
- **Message Queue Integration**: Seamless integration with existing message queue systems
- **Multiple LLM Providers**: Support for various LLM providers through LiteLLM integration
- **Storage Backends**: Pluggable storage backends with Elasticsearch and MinIO supported out of the box

## Architecture

SynthGen is built as a distributed system with several specialized components:

```mermaid
flowchart TB
    %% Title
    classDef titleClass fill:none,stroke:none,color:#FFFFFF,font-size:20px,font-weight:bold
    title["Synthetic Data Generation Framework Architecture"]
    class title titleClass
    
    %% Component definitions with detailed labels
    client([User/Client])
    api["FastAPI
    (Python)"]
    rabbitmq["RabbitMQ
    Message Broker"]
    elasticsearch["Elasticsearch
    Database"]
    minio["MinIO Object Storage
    S3-Compatible"]
    llm{{"Large Language Model"}}
    consumer["Rust Consumer
    Message Processor"]
    worker["Python Worker
    Data Processor"]
    
    %% Connections with descriptive labels
    client -->|"HTTP Requests"| api
    api -->|"Query/Store Data"| elasticsearch
    api -->|"Publish Messages"| rabbitmq
    api -->|"Store Files"| minio
    rabbitmq -->|"Process Messages"| worker
    worker -->|"Publish Processed File Data"| rabbitmq
    rabbitmq -->|"Consume Messages"| consumer
    worker -->|"Store Processed Data"| elasticsearch
    worker -->|"Read/Write Files"| minio
    consumer -->|"Generate Synthetic Data Request"| llm
    llm -->|"Return Synthetic Data"| consumer
    consumer -->|"Store Results"| elasticsearch
    
    %% Component styling with centered text
    classDef clientStyle fill:#333,stroke:#000,color:white,stroke-width:2px,text-align:center
    classDef apiStyle fill:#3776AB,stroke:#000,color:white,stroke-width:2px,text-align:center
    classDef dbStyle fill:#31648C,stroke:#000,color:white,stroke-width:2px,text-align:center
    classDef storageStyle fill:#6B8E23,stroke:#000,color:white,stroke-width:2px,text-align:center
    classDef msgStyle fill:#FF6F61,stroke:#000,color:white,stroke-width:2px,text-align:center
    classDef llmStyle fill:#9ACD32,stroke:#000,color:white,stroke-width:2px,text-align:center
    classDef workerStyle fill:#3776AB,stroke:#000,color:white,stroke-width:2px,text-align:center
    classDef consumerStyle fill:#DEA584,stroke:#000,color:white,stroke-width:2px,text-align:center
    
    %% Subgraph styling for better visibility
    classDef subgraphStyle color:#FFFFFF,text-align:center,font-weight:bold
    
    %% Apply styling
    class client clientStyle
    class api apiStyle
    class elasticsearch dbStyle
    class minio storageStyle
    class rabbitmq msgStyle
    class llm llmStyle
    class worker workerStyle
    class consumer consumerStyle
    
    %% Subgraphs for clearer organization with better visibility
    subgraph Frontend["Frontend"]
        client
    end
    
    subgraph APILayer["API Layer"]
        api
    end
    
    subgraph DataStorage["Data Storage"]
        elasticsearch
        minio
    end
    
    subgraph MessageHandling["Message Handling"]
        rabbitmq
    end
    
    subgraph ProcessingLayer["Processing Layer"]
        worker
        consumer
    end
    
    subgraph AILayer["AI Layer"]
        llm
    end
    
    %% Apply subgraph styling
    class Frontend,APILayer,DataStorage,MessageHandling,ProcessingLayer,AILayer subgraphStyle
```

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Python 3.8+
- Rust (for consumer development)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/nasirus/synthgen.git
   cd synthgen
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Start the services:
   ```bash
   docker-compose up -d
   ```

4. Verify the installation:
   ```bash
   curl http://localhost:8002/health
   ```

## Using the Client Library

SynthGen provides a powerful Python client library for easy integration. See [Synthetic Data Client](https://github.com/nasirus/synthgen-client) for detailed documentation.

```bash
pip install synthgen-client python-dotenv
```

```python
from synthgen import SynthgenClient
from synthgen.models import Task
from dotenv import load_dotenv

load_dotenv()
# Initialize the client
client = SynthgenClient()

# Create a task with caching enabled
task = Task(
    custom_id="example-task",
    method="POST",
    url="http://your-llm-provider",
    api_key="your-api-key",
    body={
        "model": "your-model",
        "messages": [{"role": "user", "content": "Your prompt here"}],
    },
    use_cache=True  # Enable caching for this task
)

# Submit and monitor with detailed tracking
results = client.monitor_batch(tasks=[task])
```

## Caching System

SynthGen implements a caching system to optimize cost and performance:

### How Caching Works

1. **Request Hashing**: Each LLM task is hashed based on its input parameters
2. **Cache Lookup**: Before processing, the system checks if an identical request has been processed before
3. **Cache Hit**: If found, the cached result is returned immediately, saving processing time and API costs
4. **Cache Miss**: If not found, the request is processed normally and the result is cached for future use

### Configuring Caching

Caching can be controlled at multiple levels:

```python
# Disable caching for specific tasks
task = Task(
    # ... task parameters
    use_cache=False
)
```

## Performance Optimization

### Parallel Processing Configuration

Adjust the number of workers and consumers in your docker-compose file:

```yaml
# docker-compose-local.yml
services:
  consumer:
    # ...
    deploy:
      mode: replicated
      replicas: ${NUM_CONSUMERS:-1}  # Set NUM_CONSUMERS env var

  worker:
    # ...
    deploy:
      mode: replicated
      replicas: ${NUM_WORKERS:-1}  # Set NUM_WORKERS env var
```

### Memory and CPU Allocation

Each component can be fine-tuned for optimal resource usage:

```yaml
# docker-compose-local.yml
services:
  consumer:
    # ...
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 1024M
```

## Observability

### Metrics Endpoints

- **Health Check**: `GET /health` - Overall system health
- **Task Status**: `GET /api/v1/tasks/{task_id}` - Detailed task information
- **Batche Status**: `GET /api/v1/batches/{batch_id}` - Detailed batch information

### CLI Monitoring Dashboard

When using the `monitor_batch()` function in the client library, a CLI-based dashboard provides real-time insights into:

- Active tasks and throughput
- Cache hit/miss ratio
- Worker and consumer status

## Configuration Options

SynthGen offers extensive configuration options via environment variables, see .env.example file:

| Variable | Description | Default |
|----------|-------------|---------|
| `RABBITMQ_URL` | RabbitMQ connection string | `amqp://guest:guest@rabbitmq:5672` |
| `ELASTICSEARCH_URL` | Elasticsearch connection string | `http://elasticsearch:9200` |
| `API_PORT` | Port for FastAPI service | `8000` |
| `NUM_WORKERS` | Number of Python worker instances | `1` |
| `NUM_CONSUMERS` | Number of Rust consumer instances | `1` |

## Deployment

For deployments, we recommend:

1. Using docker-compose file:
   ```bash
   docker-compose up -d
   ```

2. Setting up proper authentication for all services
3. Configuring higher replica counts for workers and consumers
4. Using a managed Elasticsearch service for larger deployments

## Client Libraries

- [Python Client](https://github.com/nasirus/synthgen-client) - Official Python client with async support

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 