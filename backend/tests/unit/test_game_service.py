import pytest
from app.models.game import GuessRequest, GuessItem, LocationHidden, RouteHidden
from app.services.game_service import validate_guess, get_public_route, _photo_id
from app.services.route_store import ROUTES


ROUTE = ROUTES[0]


def test_public_route_photo_schema():
    """LocationHidden exposes exactly id and photo — nothing else."""
    assert set(LocationHidden.model_fields) == {"id", "photo"}


def test_public_route_includes_all_photos():
    public = get_public_route(ROUTE)
    assert len(public.photos) == len(ROUTE.stops) + len(ROUTE.decoys)


def test_public_route_photo_ids_are_unique():
    public = get_public_route(ROUTE)
    ids = [p.id for p in public.photos]
    assert len(ids) == len(set(ids))


def test_perfect_guess_whenAllStopsCorrect_shouldSolve():
    assignments = [
        GuessItem(slot_index=i, photo_id=_photo_id(s.photo))
        for i, s in enumerate(ROUTE.stops)
    ]
    response = validate_guess(GuessRequest(route_id=ROUTE.id, assignments=assignments), guess_number=1)

    assert response.solved is True
    assert response.correct_count == len(ROUTE.stops)
    assert all(f.result == "correct" for f in response.feedback)


def test_decoy_placement_whenDecoyInSlot_shouldReturnRed():
    assignments = [GuessItem(slot_index=0, photo_id=_photo_id(ROUTE.decoys[0].photo))]
    response = validate_guess(GuessRequest(route_id=ROUTE.id, assignments=assignments), guess_number=1)

    assert response.feedback[0].result == "decoy"
    assert response.solved is False


def test_wrong_position_whenStopInWrongSlot_shouldReturnYellow():
    assignments = [GuessItem(slot_index=0, photo_id=_photo_id(ROUTE.stops[1].photo))]
    response = validate_guess(GuessRequest(route_id=ROUTE.id, assignments=assignments), guess_number=1)

    assert response.feedback[0].result == "wrong_slot"


def test_guesses_remaining_whenGuessSubmitted_shouldDecrement():
    assignments = [GuessItem(slot_index=0, photo_id=_photo_id(ROUTE.decoys[0].photo))]
    request = GuessRequest(route_id=ROUTE.id, assignments=assignments)

    assert validate_guess(request, guess_number=1).guesses_remaining == 2
    assert validate_guess(request, guess_number=2).guesses_remaining == 1


def test_invalid_route_whenRouteNotFound_shouldRaise():
    with pytest.raises(ValueError):
        validate_guess(GuessRequest(route_id="does-not-exist", assignments=[]), guess_number=1)
