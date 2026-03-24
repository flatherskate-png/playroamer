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
    stops: List[Location]
    decoys: List[Decoy]


class HiddenLocation(BaseModel):
    """A location as the client sees it — name and photo only, no coordinates or position."""
    name: str
    photo: str


class SlotLocation(BaseModel):
    """Geographic position of a route slot — no name, no photo."""
    lat: float
    lng: float


class RoutePublic(BaseModel):
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
    slots: List[SlotLocation]
    photos: List[HiddenLocation]


class RouteReveal(BaseModel):
    """Full solution data — only sent after game ends."""
    stops: List[Location]
    decoy_names: List[str]


class GuessItem(BaseModel):
    slot_index: int
    photo_name: str


class GuessRequest(BaseModel):
    route_id: str
    assignments: List[GuessItem]


class SlotFeedback(BaseModel):
    slot_index: int
    result: str  # "green" | "yellow" | "red"


class GuessResponse(BaseModel):
    feedback: List[SlotFeedback]
    correct_count: int
    total_stops: int
    solved: bool
    guesses_remaining: int
