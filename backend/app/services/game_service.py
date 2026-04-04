import hashlib
import random
from app.models.game import (
    Route, RouteHidden, RouteRevealed, LocationHidden, SlotHidden,
    GuessRequest, GuessResponse, SlotFeedback,
)
from app.services.route_store import get_route_by_id

MAX_GUESSES = 3

# Stable opaque ID scheme:
#   Each photo gets an ID derived from a SHA-256 hash of its URL.
#   This is deterministic (server can recompute it) and opaque (reveals
#   nothing about whether a card is a stop or a decoy).


def _photo_id(photo_url: str) -> str:
    """Return a short, URL-safe hash of the photo URL.

    INVARIANT: This function must be called identically for stops and decoys.
    Using the same factory for both ensures IDs are opaque — the client cannot
    infer whether a card is a stop or decoy from its ID alone.
    """
    digest = hashlib.sha256(photo_url.encode()).hexdigest()[:12]
    return f"photo_{digest}"


def get_public_route(route: Route) -> RouteHidden:
    """
    Return only what the client needs to render the puzzle.
    Photos are shuffled (stops + decoys mixed) with no lat/lng or names.
    Slots expose ordered pin positions without revealing which photo goes where.
    """
    all_photos: list[LocationHidden] = [
        LocationHidden(id=_photo_id(s.photo), photo=s.photo) for s in route.stops
    ] + [
        LocationHidden(id=_photo_id(d.photo), photo=d.photo) for d in route.decoys
    ]
    seed = int(hashlib.sha256(route.id.encode()).hexdigest(), 16) % (2**32)
    random.Random(seed).shuffle(all_photos)
    return RouteHidden(
        id=route.id,
        name=route.name,
        region=route.region,
        pack=route.pack,
        stop_count=len(route.stops),
        decoy_count=len(route.decoys),
        slots=[SlotHidden(lat=s.lat, lng=s.lng) for s in route.stops],
        photos=all_photos,
        explore_url=route.explore_url,   # ← added
    )


def get_reveal(route: Route) -> RouteRevealed:
    """Return full solution data — only call after the game has ended."""
    return RouteRevealed(
        stops=route.stops,
        decoy_names=[d.name for d in route.decoys],
        blurb=route.blurb,
    )


def validate_guess(request: GuessRequest, guess_number: int) -> GuessResponse:
    """
    Server-side answer validation. The client submits opaque photo IDs;
    the server resolves them to location names internally.
    """
    route = get_route_by_id(request.route_id)
    if not route:
        raise ValueError(f"Route {request.route_id} not found")

    # Rebuild lookup: opaque hash-based id → location name
    # Recomputing _photo_id from route data is deterministic and stateless.
    id_to_name = {_photo_id(s.photo): s.name for s in route.stops}
    id_to_name.update({_photo_id(d.photo): d.name for d in route.decoys})

    # Build a set of all real stop names for yellow detection
    stop_names = {s.name for s in route.stops}

    assignment_map = {item.slot_index: id_to_name.get(item.photo_id) for item in request.assignments}
    feedback: list[SlotFeedback] = []
    correct_count = 0

    for i, stop in enumerate(route.stops):
        placed_name = assignment_map.get(i)
        if placed_name is None:
            continue

        if placed_name == stop.name:
            result = "correct"
            correct_count += 1
        elif placed_name in stop_names:
            result = "wrong_slot"
        else:
            result = "decoy"

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
