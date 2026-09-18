"""Test-only isolation helpers. No credentials or network calls at import time."""
from urllib.parse import urlsplit
from uuid import uuid4


def require_local_target(url):
    parsed = urlsplit(url)
    if (parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
            or parsed.username or parsed.password or parsed.path not in {"", "/"}
            or parsed.query or parsed.fragment or not parsed.port):
        raise ValueError("Tests require an explicit local disposable service URL with a port")
    return url.rstrip("/")


class FixtureRoutes:
    """Track successful inserts; a date/name or configured user is not deletion authority."""
    def __init__(self):
        self.user_id = str(uuid4())
        self.route_ids = set()

    def record(self, route_id):
        self.route_ids.add(route_id)
        return route_id

    def cleanup(self, db):
        for route_id in list(self.route_ids):
            db.table("sessions").delete().eq("current_route_id", route_id).eq("user_id", self.user_id).execute()
            db.table("routes").delete().eq("id", route_id).eq("user_id", self.user_id).execute()
            self.route_ids.remove(route_id)
