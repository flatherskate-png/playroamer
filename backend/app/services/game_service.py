import random
from app.models.game import (
    Route, RoutePublic, RouteReveal, HiddenLocation, SlotLocation,
    GuessRequest, GuessResponse, SlotFeedback,
)
from app.services.route_store import get_route_by_id

MAX_GUESSES = 3


def get_public_route(route: Route) -> RoutePublic:
    """
    Return only what the client needs to render the puzzle.
    Photos are shuffled (stops + decoys mixed) with no lat/lng.
    Slots expose ordered pin positions without revealing which photo goes where.
    """
    all_photos: list[HiddenLocation] = [
        HiddenLocation(name=s.name, photo=s.photo) for s in route.stops
    ] + [
        HiddenLocation(name=d.name, photo=d.photo) for d in route.decoys
    ]
    random.shuffle(all_photos)
    return RoutePublic(
        id=route.id,
        name=route.name,
        region=route.region,
        pack=route.pack,
        stop_count=len(route.stops),
        decoy_count=len(route.decoys),
        slots=[SlotLocation(lat=s.lat, lng=s.lng) for s in route.stops],
        photos=all_photos,
    )


def get_reveal(route: Route) -> RouteReveal:
    """Return full solution data — only call after the game has ended."""
    return RouteReveal(
        stops=route.stops,
        decoy_names=[d.name for d in route.decoys],
    )


def validate_guess(request: GuessRequest, guess_number: int) -> GuessResponse:
    """
    Server-side answer validation. The client never sees stop order or coords.
    """
    route = get_route_by_id(request.route_id)
    if not route:
        raise ValueError(f"Route {request.route_id} not found")

    assignment_map = {item.slot_index: item.photo_name for item in request.assignments}
    feedback: list[SlotFeedback] = []
    correct_count = 0

    for i, stop in enumerate(route.stops):
        placed_name = assignment_map.get(i)
        if placed_name is None:
            continue

        if placed_name == stop.name:
            result = "green"
            correct_count += 1
        elif any(s.name == placed_name for s in route.stops):
            result = "yellow"  # real location, wrong position
        else:
            result = "red"     # decoy

        feedback.append(SlotFeedback(slot_index=i, result=result))

    solved = correct_count == len(route.stops)
    guesses_remaining = MAX_GUESSES - guess_number

    return GuessResponse(
        feedback=feedback,
        correct_count=correct_count,
        total_stops=len(route.stops),
        solved=solved,
        guesses_remaining=guesses_remaining,
    )
