# API routes package 
from fastapi import APIRouter
from importlib import import_module
from pathlib import Path
from api.endpoints import tasks, status
    
def get_all_routers() -> list[APIRouter]:
    """Automatically discover and return all routers in the endpoints directory."""
    routers = []
    endpoints_dir = Path(__file__).parent / "endpoints"
    
    # Get all Python files in the endpoints directory
    for file in endpoints_dir.glob("*.py"):
        if file.name != "__init__.py":
            # Convert file path to module path - add 'src.' prefix
            module_name = f"api.endpoints.{file.stem}"
            
            # Import the module
            module = import_module(module_name)
            
            # If the module has a router attribute, add it to our list
            if hasattr(module, "router"):
                router = getattr(module, "router")
                # Check if the router should have API version prefix
                if getattr(module, "USE_API_PREFIX", True):
                    routers.append(("api", router))
                else:
                    routers.append(("root", router))
    
    return routers 