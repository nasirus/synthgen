from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.auth import get_current_user

router = APIRouter()
USE_API_PREFIX = False


class TokenResponse(BaseModel):
    isValid: bool


@router.get("/token", response_model=TokenResponse)
async def get_token(
    current_user: str = Depends(get_current_user),
):
    try:
        return TokenResponse(isValid=True)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch token: {str(e)}")
