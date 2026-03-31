"""
Backend API Tests for AlterEcho
Tests health check and status endpoints
"""
import pytest
import requests
import os

# Use public URL for testing (from frontend/.env EXPO_PUBLIC_BACKEND_URL)
BASE_URL = "https://audio-engine-preview.preview.emergentagent.com"

class TestHealthCheck:
    """Health check endpoint tests"""

    def test_health_check_returns_200(self):
        """Test that /api/ returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Health check passed: {response.status_code}")

    def test_health_check_returns_json(self):
        """Test that /api/ returns valid JSON"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data, "Response should contain 'message' field"
        print(f"✓ Health check JSON valid: {data}")


class TestStatusEndpoints:
    """Status check CRUD tests"""

    def test_create_status_check(self):
        """Test creating a status check"""
        payload = {
            "client_name": "TEST_playwright_client"
        }
        response = requests.post(f"{BASE_URL}/api/status", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "id" in data, "Response should contain 'id' field"
        assert "client_name" in data, "Response should contain 'client_name' field"
        assert data["client_name"] == payload["client_name"]
        assert "timestamp" in data, "Response should contain 'timestamp' field"
        print(f"✓ Status check created: {data['id']}")

    def test_get_status_checks(self):
        """Test retrieving all status checks"""
        response = requests.get(f"{BASE_URL}/api/status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Retrieved {len(data)} status checks")

    def test_create_and_verify_persistence(self):
        """Test that created status check persists in database"""
        # Create a new status check
        payload = {
            "client_name": "TEST_persistence_check"
        }
        create_response = requests.post(f"{BASE_URL}/api/status", json=payload)
        assert create_response.status_code == 200
        created_data = create_response.json()
        created_id = created_data["id"]
        
        # Verify it appears in the list
        get_response = requests.get(f"{BASE_URL}/api/status")
        assert get_response.status_code == 200
        all_checks = get_response.json()
        
        # Find our created check
        found = False
        for check in all_checks:
            if check["id"] == created_id:
                found = True
                assert check["client_name"] == payload["client_name"]
                break
        
        assert found, f"Created status check with id {created_id} not found in list"
        print(f"✓ Status check persisted correctly: {created_id}")


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session
