FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .

# Install uv and create virtual environment
RUN pip install uv --no-cache-dir 
RUN uv venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
RUN uv pip install --no-cache-dir -r requirements.txt

COPY src/ /app/src/

# Add PYTHONPATH environment variable
ENV PYTHONPATH=/app/src

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"] 