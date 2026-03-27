from pydantic import BaseModel
from typing import List


class Location(BaseModel):
    name: str
    photo: str
    lat: float
    lng: float


class Decoy(BaseModel):
    name: str
    photo: str


class Route(BaseModel):
    id: str
    name: str
    region: str = ""
    pack: str = ""
    blurb: str = ""
    stops: List[Location]
    decoys: List[Decoy]


class LocationHidden(BaseModel):
    """A location as the client sees it — opaque id and photo only, no name or coordinates."""
    id: str   # stable opaque key: "photo_<sha256[:12]>" of the photo URL
    photo: str


class SlotHidden(BaseModel):
    """Geographic position of a route slot — no name, no photo."""
    lat: float
    lng: float


class RouteHidden(BaseModel):
    """Route data safe to send to the client during gameplay.

    Photos are shuffled (stops + decoys mixed) with no lat/lng.
    Slots expose the ordered pin positions so the geo map can render,
    but without revealing which photo belongs in each slot.
    """
    id: str
    name: str
    region: str
    pack: str
    stop_count: int
    decoy_count: int
    slots: List[SlotHidden]
    photos: List[LocationHidden]


class RouteRevealed(BaseModel):
    """Full solution data — only sent after game ends."""
    stops: List[Location]
    decoy_names: List[str]
    blurb: str = ""


class GuessItem(BaseModel):
    slot_index: int
    photo_id: str   # opaque id from LocationHidden.id


class GuessRequest(BaseModel):
    route_id: str
    assignments: List[GuessItem]


class SlotFeedback(BaseModel):
    slot_index: int
    result: str  # "correct" | "wrong_slot" | "decoy"


class GuessResponse(BaseModel):
    feedback: List[SlotFeedback]
    correct_count: int
    total_stops: int
    solved: bool
    guesses_remaining: int
