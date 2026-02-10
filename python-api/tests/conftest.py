import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.fixture
def mock_supabase():
    """Mock Supabase client for unit tests."""
    with patch("app.services.database._client") as mock_client:
        yield mock_client


@pytest.fixture
def client():
    """FastAPI test client."""
    from app.main import app
    return TestClient(app)
