# Synthetic Data Generation Framework Architecture

## Architecture Diagram

The following diagram illustrates the architecture of our Synthetic Data Generation Framework:

```mermaid
flowchart TB
    %% Title
    classDef titleClass fill:none,stroke:none,color:black,font-size:20px,font-weight:bold
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
    llm{{"Large Language Model
    Synthetic Data Generator"}}
    consumer["Rust Consumer
    Message Processor"]
    worker["Python Worker
    Data Processor"]
    
    %% Connections with descriptive labels
    client -->|"HTTP Requests"| api
    api -->|"Query/Store Data"| elasticsearch
    api -->|"Publish Messages"| rabbitmq
    rabbitmq -->|"Process Messages"| worker
    worker -->|"Generate Synthetic Data
    Request"| llm
    llm -->|"Return Synthetic Data"| worker
    worker -->|"Store Results"| elasticsearch
    rabbitmq -->|"Consume Messages"| consumer
    consumer -->|"Store Processed Data"| elasticsearch
    
    %% Component styling
    classDef clientStyle fill:#333,stroke:#000,color:white,stroke-width:2px
    classDef apiStyle fill:#3776AB,stroke:#000,color:white,stroke-width:2px
    classDef dbStyle fill:#31648C,stroke:#000,color:white,stroke-width:2px
    classDef msgStyle fill:#FF6F61,stroke:#000,color:white,stroke-width:2px
    classDef llmStyle fill:#9ACD32,stroke:#000,color:white,stroke-width:2px
    classDef workerStyle fill:#3776AB,stroke:#000,color:white,stroke-width:2px
    classDef consumerStyle fill:#DEA584,stroke:#000,color:white,stroke-width:2px
    
    %% Apply styling
    class client clientStyle
    class api apiStyle
    class elasticsearch dbStyle
    class rabbitmq msgStyle
    class llm llmStyle
    class worker workerStyle
    class consumer consumerStyle
    
    %% Subgraphs for clearer organization
    subgraph Frontend
        client
    end
    
    subgraph "API Layer"
        api
    end
    
    subgraph "Data Storage"
        elasticsearch
    end
    
    subgraph "Message Handling"
        rabbitmq
    end
    
    subgraph "Processing Layer"
        worker
        consumer
    end
    
    subgraph "AI Layer"
        llm
    end
```

## Component Details

### 1. Frontend - User/Client
This represents the entry point where users or external systems interact with our framework. Clients make HTTP requests to the API layer.

### 2. API Layer - FastAPI (Python)
The web framework that handles incoming HTTP requests. It routes requests appropriately and is responsible for:
- Authentication and authorization
- Input validation
- Request routing
- Response formatting
- Publishing messages to RabbitMQ
- Interacting with Elasticsearch for data storage and retrieval

### 3. Message Handling - RabbitMQ
The message broker that enables asynchronous communication between components:
- Queues messages for processing
- Ensures message delivery
- Handles message persistence
- Supports multiple consumers
- Provides message acknowledgment mechanisms

### 4. Processing Layer
Consists of two main components:

#### Rust Consumer
- Processes messages from RabbitMQ
- Interacts with the LLM to generate synthetic data
- Stores results in Elasticsearch
- Handles retries and error scenarios

#### Python Worker
- High-performance message consumer written in Rust
- Optimized for efficiency and throughput
- Processes specific types of messages
- Stores processed data in Elasticsearch

### 5. AI Layer - Large Language Model
The AI component responsible for generating synthetic data:
- Receives requests from the Python Worker
- Generates high-quality synthetic data based on inputs
- Returns data back to the Worker for storage
- Can be configured to use different LLM providers

### 6. Data Storage - Elasticsearch
The database layer that stores:
- Input data from clients
- Generated synthetic data
- Metadata about processing status
- Logs and monitoring information
- Configuration data

## Data Flow

1. A client sends an HTTP request to the FastAPI endpoint
2. FastAPI processes the request and publishes a message to RabbitMQ
3. The Python Worker consumes the message and sends a request to the LLM
4. The LLM generates synthetic data and returns it to the Worker
5. The Worker stores the results in Elasticsearch
6. In parallel, the Rust Consumer can process other types of messages from RabbitMQ
7. The Rust Consumer also stores its processed data in Elasticsearch
8. Clients can query FastAPI to retrieve the generated data from Elasticsearch

This architecture provides a scalable, fault-tolerant approach to synthetic data generation using LLMs. 