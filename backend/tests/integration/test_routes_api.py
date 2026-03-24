import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.route_store import ROUTES
from app.services.game_service import _photo_id


ROUTE = ROUTES[0]


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_daily_route_returns_no_solution_data(client):
    response = await client.get("/api/v1/routes/daily")
    assert response.status_code == 200
    data = response.json()
    assert "stops" not in data
    for photo in data["photos"]:
        assert "lat" not in photo
        assert "lng" not in photo
        assert "name" not in photo


@pytest.mark.asyncio
async def test_get_route_not_found(client):
    response = await client.get("/api/v1/routes/nonexistent")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_submit_correct_guess(client):
    assignments = [{"slot_index": i, "photo_id": _photo_id(s.photo)} for i, s in enumerate(ROUTE.stops)]
    payload = {"route_id": ROUTE.id, "assignments": assignments}

    response = await client.post(
        f"/api/v1/routes/{ROUTE.id}/guess?guess_number=1",
        json=payload,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["solved"] is True
    assert data["correct_count"] == len(ROUTE.stops)


@pytest.mark.asyncio
async def test_submit_guess_route_id_mismatch(client):
    payload = {"route_id": "wrong-id", "assignments": []}
    response = await client.post(
        f"/api/v1/routes/{ROUTE.id}/guess?guess_number=1",
        json=payload,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_guess_number_out_of_range(client):
    payload = {"route_id": ROUTE.id, "assignments": []}
    response = await client.post(
        f"/api/v1/routes/{ROUTE.id}/guess?guess_number=5",
        json=payload,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_reveal_includes_blurb(client):
    # Trigger a guess first (or just call reveal directly — endpoint has no auth guard)
    response = await client.get(f"/api/v1/routes/{ROUTE.id}/reveal")
    assert response.status_code == 200
    data = response.json()
    assert "blurb" in data
    assert isinstance(data["blurb"], str)
