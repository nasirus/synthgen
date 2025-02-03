from datasets import load_dataset
import json
import os

from dotenv import load_dotenv
load_dotenv()

def load_wildcat_dataset(split="train", n_samples=100):
    """Load the WildChat dataset"""
    return load_dataset("allenai/WildChat", split=split).select(range(n_samples))


def transform_to_tasks(dataset, model_name, url):
    """Transform dataset messages into tasks format"""
    tasks = []
    for idx, item in enumerate(dataset):
        if item["conversation"]:
            message = item["conversation"][0]
            task = {
                "custom_id": f"request-{idx+1}",
                "method": "POST",
                "url": url,
                "api_key": os.getenv("OPENROUTER_API_KEY"),
                "body": {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": "You are a helpful assistant."},
                        {"role": "user", "content": message["content"]},
                    ],
                    "max_tokens": 1000,
                    "temperature": 0.5,
                    "stream": False,
                    "top_p": 0.9,
                    "top_k": 40,
                    "frequency_penalty": 0,
                    "presence_penalty": 0,
                },
            }
            tasks.append(task)
    return tasks


def write_tasks_to_jsonl(tasks, output_file="tasks.jsonl"):
    """Write tasks to a JSONL file"""
    with open(output_file, "w", encoding="utf-8") as f:
        for task in tasks:
            f.write(json.dumps(task) + "\n")


if __name__ == "__main__":
    model_name = "meta-llama/llama-3.2-1b-instruct"
    url = "https://openrouter.ai/api/v1/chat/completions"
    n_samples = 1000
    # Load dataset
    dataset = load_wildcat_dataset(n_samples=n_samples)

    # Transform to tasks
    tasks = transform_to_tasks(dataset, model_name=model_name, url=url)

    # Write to file
    write_tasks_to_jsonl(tasks, "wildcat_tasks.jsonl")
