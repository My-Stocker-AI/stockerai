from supabase import create_client, Client
from app.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


def rpc(function_name: str, params: dict) -> list:
    """Call a Supabase RPC function and return data."""
    result = get_client().rpc(function_name, params).execute()
    return result.data


def query(table: str):
    """Start a query builder on a table."""
    return get_client().table(table)
