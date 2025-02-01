from fastapi import FastAPI
from core.config import settings
from api import get_all_routers
import uvicorn
from contextlib import asynccontextmanager
from database.session import init_async_pool, close_async_pool

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_async_pool()
    yield
    await close_async_pool()

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API for generating synthetic data using LLMs",
    version=settings.VERSION,
    lifespan=lifespan
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
        "redoc_url": "/redoc"
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
