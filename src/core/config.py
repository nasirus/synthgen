import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Settings:
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Synthetic Data Generator API"
    VERSION: str = "1.0.0"
    
    # RabbitMQ Settings
    RABBITMQ_USER: str = os.getenv('RABBITMQ_USER', 'guest')
    RABBITMQ_PASS: str = os.getenv('RABBITMQ_PASS', 'guest')
    RABBITMQ_HOST: str = os.getenv('RABBITMQ_HOST', 'localhost')
    RABBITMQ_PORT: int = int(os.getenv('RABBITMQ_PORT', 5672))
    
    # Database Settings (for future use)
    DATABASE_URL: str = os.getenv('DATABASE_URL', 'sqlite:///./sql_app.db')
    
    # LLM Settings (for future use)
    LLM_API_KEY: str = os.getenv('LLM_API_KEY', '')
    LLM_MODEL: str = os.getenv('LLM_MODEL', 'gpt-3.5-turbo')

settings = Settings() 