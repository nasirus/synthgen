from typing import Dict, Any
from litellm import completion
from tenacity import retry, stop_after_attempt, wait_exponential
import logging
from core.config import settings

logger = logging.getLogger(__name__)

@retry(
    stop=stop_after_attempt(settings.MAX_RETRIES),
    wait=wait_exponential(multiplier=2, min=4, max=60),
    reraise=True,
    before_sleep=lambda retry_state: logger.info(
        f"Retrying LLM request attempt {retry_state.attempt_number}"
    ),
)
def send_llm_request(payload: Dict[str, Any]) -> Any:
    """
    Send a request to the LLM with retry mechanism.
    
    Args:
        payload (Dict[str, Any]): The request payload containing model and messages
        
    Returns:
        Any: The LLM response
        
    Raises:
        Exception: If the LLM request fails after all retries
    """
    return completion(
        model=payload["model"],
        messages=payload["messages"]
    ) 