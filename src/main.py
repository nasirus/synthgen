from fastapi import FastAPI
from core.config import settings
from api import get_all_routers
import uvicorn


# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API for generating synthetic data using LLMs",
    version=settings.VERSION,
)

# Dynamically include all routers
for router_type, router in get_all_routers():
    if router_type == "api":
        app.include_router(router, prefix=settings.API_V1_STR)
    else:
        app.include_router(router)


# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Welcome to Synthetic Data Generator API",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
