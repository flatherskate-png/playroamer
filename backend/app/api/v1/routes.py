from fastapi import APIRouter, HTTPException, Query

from app.models.game import RouteHidden, RouteRevealed, GuessRequest, GuessResponse
from app.services.route_store import get_route_by_id, get_daily_route, get_all_routes
from app.services.game_service import get_public_route, get_reveal, validate_guess

router = APIRouter()


@router.get("/routes/daily", response_model=RouteHidden)
async def daily_route():
    """Return today's route — photos shuffled, no solution data."""
    route = get_daily_route()
    return get_public_route(route)


@router.get("/routes", response_model=list[RouteHidden])
async def list_routes():
    """Return all available routes without solution data."""
    return [get_public_route(r) for r in get_all_routes()]


@router.get("/routes/{route_id}", response_model=RouteHidden)
async def get_route(route_id: str):
    """Return a specific route without solution data."""
    route = get_route_by_id(route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return get_public_route(route)


@router.get("/routes/{route_id}/reveal", response_model=RouteRevealed)
async def reveal_route(route_id: str):
    """Return full solution data — call only after the game has ended."""
    route = get_route_by_id(route_id)
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return get_reveal(route)


@router.post("/routes/{route_id}/guess", response_model=GuessResponse)
async def submit_guess(
    route_id: str,
    request: GuessRequest,
    guess_number: int = Query(ge=1, le=3),
):
    """Validate a guess. Server owns the answer — client never sees stop order."""
    if request.route_id != route_id:
        raise HTTPException(status_code=400, detail="Route ID mismatch")
    try:
        return validate_guess(request, guess_number)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
