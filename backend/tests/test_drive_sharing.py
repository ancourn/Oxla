"""
Comprehensive Drive Service Sharing Tests

This module tests secure sharing functionality including:
- Password-protected sharing links
- Download limits
- Expiration times
- Share analytics and access logs
- Bulk sharing functionality
"""

import pytest
import io
from fastapi import status
from datetime import datetime, timedelta


class TestBasicSharing:
    """Test basic sharing link functionality."""
    
    def test_create_share_link(self, client, auth_headers, db_session):
        """Test creating a basic share link for a file."""
        # Upload a file first
        test_content = b"Share test content"
        test_file = io.BytesIO(test_content)
        test_file.name = "share_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("share_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create share link
        share_data = {
            "share_type": "view",
            "expires_hours": None,
            "password": None,
            "max_downloads": None
        }
        
        response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert "share_id" in data
        assert "share_token" in data
        assert "share_url" in data
        assert data["share_type"] == "view"
        assert data["has_password"] is False
    
    def test_create_share_link_with_expiration(self, client, auth_headers, db_session):
        """Test creating a share link with expiration time."""
        # Upload a file
        test_content = b"Expiring share test"
        test_file = io.BytesIO(test_content)
        test_file.name = "expiring_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("expiring_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create share link with 24-hour expiration
        share_data = {
            "share_type": "view",
            "expires_hours": 24,
            "password": None,
            "max_downloads": None
        }
        
        response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert data["expires_at"] is not None
        assert data["has_password"] is False
    
    def test_create_share_link_with_download_limit(self, client, auth_headers, db_session):
        """Test creating a share link with download limit."""
        # Upload a file
        test_content = b"Limited download test"
        test_file = io.BytesIO(test_content)
        test_file.name = "limited_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("limited_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create share link with download limit
        share_data = {
            "share_type": "view",
            "expires_hours": None,
            "password": None,
            "max_downloads": 5
        }
        
        response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert data["max_downloads"] == 5
    
    def test_get_share_info(self, client, auth_headers, db_session):
        """Test getting information about a share link."""
        # Upload a file and create share link
        test_content = b"Share info test"
        test_file = io.BytesIO(test_content)
        test_file.name = "info_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("info_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view", "expires_hours": None, "password": None, "max_downloads": None}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Get share info (no auth required)
        response = client.get(f"/drive/share/{share_token}/info")
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert data["filename"] == "info_test.txt"
        assert data["file_size"] == len(test_content)
        assert data["requires_password"] is False


class TestPasswordProtectedSharing:
    """Test password-protected sharing links."""
    
    def test_create_password_protected_share(self, client, auth_headers, db_session):
        """Test creating a password-protected share link."""
        # Upload a file
        test_content = b"Password protected test"
        test_file = io.BytesIO(test_content)
        test_file.name = "protected_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("protected_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create password-protected share link
        share_data = {
            "share_type": "view",
            "expires_hours": None,
            "password": "securepassword123",
            "max_downloads": None
        }
        
        response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert data["has_password"] is True
    
    def test_verify_password_for_share(self, client, auth_headers, db_session):
        """Test verifying password for a protected share link."""
        # Upload a file and create password-protected share
        test_content = b"Password verify test"
        test_file = io.BytesIO(test_content)
        test_file.name = "verify_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("verify_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {
            "share_type": "view",
            "expires_hours": None,
            "password": "correctpassword",
            "max_downloads": None
        }
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Verify with correct password
        verify_data = {"password": "correctpassword"}
        response = client.post(f"/drive/share/{share_token}/verify-password", json=verify_data)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert "verification_token" in data
    
    def test_verify_wrong_password(self, client, auth_headers, db_session):
        """Test verifying with wrong password."""
        # Upload a file and create password-protected share
        test_content = b"Wrong password test"
        test_file = io.BytesIO(test_content)
        test_file.name = "wrong_pass_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("wrong_pass_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {
            "share_type": "view",
            "expires_hours": None,
            "password": "correctpassword",
            "max_downloads": None
        }
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Verify with wrong password
        verify_data = {"password": "wrongpassword"}
        response = client.post(f"/drive/share/{share_token}/verify-password", json=verify_data)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert data["success"] is False
    
    def test_access_password_protected_share(self, client, auth_headers, db_session):
        """Test accessing a password-protected share link."""
        # Upload a file and create password-protected share
        test_content = b"Access protected test"
        test_file = io.BytesIO(test_content)
        test_file.name = "access_protected.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("access_protected.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {
            "share_type": "view",
            "expires_hours": None,
            "password": "securepassword",
            "max_downloads": None
        }
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Try to access without password
        response = client.get(f"/drive/share/{share_token}")
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert "X-Requires-Password" in response.headers


class TestDownloadLimits:
    """Test download limit enforcement for shared files."""
    
    def test_download_limit_enforcement(self, client, auth_headers, db_session):
        """Test that download limits are enforced."""
        # Upload a file
        test_content = b"Download limit test"
        test_file = io.BytesIO(test_content)
        test_file.name = "limit_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("limit_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create share link with 2 download limit
        share_data = {
            "share_type": "view",
            "expires_hours": None,
            "password": None,
            "max_downloads": 2
        }
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Download file twice (should succeed)
        for i in range(2):
            response = client.get(f"/drive/share/{share_token}")
            assert response.status_code == status.HTTP_200_OK
            assert response.content == test_content
        
        # Third download should fail
        response = client.get(f"/drive/share/{share_token}")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "Download limit reached" in data.get("message", "")
    
    def test_downloads_remaining_header(self, client, auth_headers, db_session):
        """Test that downloads remaining is returned in headers."""
        # Upload a file
        test_content = b"Downloads remaining test"
        test_file = io.BytesIO(test_content)
        test_file.name = "remaining_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("remaining_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create share link with 5 download limit
        share_data = {
            "share_type": "view",
            "expires_hours": None,
            "password": None,
            "max_downloads": 5
        }
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Download file and check header
        response = client.get(f"/drive/share/{share_token}")
        assert response.status_code == status.HTTP_200_OK
        assert "X-Downloads-Remaining" in response.headers
        assert int(response.headers["X-Downloads-Remaining"]) == 4


class TestShareExpiration:
    """Test share link expiration functionality."""
    
    def test_expired_share_link(self, client, auth_headers, db_session):
        """Test accessing an expired share link."""
        # Upload a file
        test_content = b"Expired share test"
        test_file = io.BytesIO(test_content)
        test_file.name = "expired_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("expired_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create share link with very short expiration (1 second)
        share_data = {
            "share_type": "view",
            "expires_hours": 0.0003,  # ~1 second
            "password": None,
            "max_downloads": None
        }
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Wait for expiration
        import time
        time.sleep(2)
        
        # Try to access expired link
        response = client.get(f"/drive/share/{share_token}")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        data = response.json()
        assert "expired" in data.get("message", "").lower()


class TestShareAnalytics:
    """Test share analytics and access logging."""
    
    def test_get_share_analytics(self, client, auth_headers, db_session):
        """Test getting analytics for a share link."""
        # Upload a file and create share link
        test_content = b"Analytics test"
        test_file = io.BytesIO(test_content)
        test_file.name = "analytics_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("analytics_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view", "expires_hours": None, "password": None, "max_downloads": None}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_id = share_response.json()["share_id"]
        
        # Access the shared file a few times to generate analytics
        for _ in range(3):
            client.get(f"/drive/share/{share_response.json()['share_token']}")
        
        # Get analytics
        response = client.get(f"/drive/share/{share_id}/analytics", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert data["file_name"] == "analytics_test.txt"
        assert data["total_downloads"] >= 3
        assert "recent_access" in data
    
    def test_analytics_includes_failed_attempts(self, client, auth_headers, db_session):
        """Test that analytics includes failed password attempts."""
        # Upload a file and create password-protected share
        test_content = b"Failed attempts test"
        test_file = io.BytesIO(test_content)
        test_file.name = "failed_attempts.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("failed_attempts.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {
            "share_type": "view",
            "expires_hours": None,
            "password": "correctpassword",
            "max_downloads": None
        }
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_id = share_response.json()["share_id"]
        share_token = share_response.json()["share_token"]
        
        # Try wrong password multiple times
        for _ in range(3):
            verify_data = {"password": "wrongpassword"}
            client.post(f"/drive/share/{share_token}/verify-password", json=verify_data)
        
        # Get analytics
        response = client.get(f"/drive/share/{share_id}/analytics", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["failed_password_attempts"] >= 3


class TestShareRevocation:
    """Test share link revocation functionality."""
    
    def test_revoke_share_link(self, client, auth_headers, db_session):
        """Test revoking a share link."""
        # Upload a file and create share link
        test_content = b"Revoke test"
        test_file = io.BytesIO(test_content)
        test_file.name = "revoke_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("revoke_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view", "expires_hours": None, "password": None, "max_downloads": None}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_id = share_response.json()["share_id"]
        share_token = share_response.json()["share_token"]
        
        # Verify share works before revocation
        response = client.get(f"/drive/share/{share_token}")
        assert response.status_code == status.HTTP_200_OK
        
        # Revoke share link
        revoke_response = client.delete(f"/drive/share/{share_id}", headers=auth_headers)
        assert revoke_response.status_code == status.HTTP_200_OK
        
        # Verify share no longer works
        response = client.get(f"/drive/share/{share_token}")
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_revoke_nonexistent_share(self, client, auth_headers):
        """Test revoking a share that doesn't exist."""
        response = client.delete("/drive/share/99999", headers=auth_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestBulkSharing:
    """Test bulk sharing functionality."""
    
    def test_create_multiple_shares(self, client, auth_headers, db_session):
        """Test creating share links for multiple files."""
        # Upload multiple files
        file_ids = []
        for i in range(3):
            test_content = f"Bulk share test {i}".encode()
            test_file = io.BytesIO(test_content)
            test_file.name = f"bulk_test_{i}.txt"
            test_file.content_type = "text/plain"
            
            files = {"file": (f"bulk_test_{i}.txt", test_file, "text/plain")}
            data = {"folder_id": ""}
            
            upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
            file_ids.append(upload_response.json()["file_id"])
        
        # Create share links for all files
        share_tokens = []
        for file_id in file_ids:
            share_data = {"share_type": "view", "expires_hours": None, "password": None, "max_downloads": None}
            share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
            share_tokens.append(share_response.json()["share_token"])
        
        # Verify all shares work
        for i, share_token in enumerate(share_tokens):
            response = client.get(f"/drive/share/{share_token}")
            assert response.status_code == status.HTTP_200_OK
            assert response.content == f"Bulk share test {i}".encode()


class TestShareSecurity:
    """Test security aspects of sharing functionality."""
    
    def test_share_without_ownership(self, client, auth_headers, db_session, create_test_user):
        """Test that only file owners can create shares."""
        # Upload a file as first user
        test_content = b"Ownership test"
        test_file = io.BytesIO(test_content)
        test_file.name = "ownership_test.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("ownership_test.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Try to create share as different user
        other_user_headers = create_test_user("other@example.com", "otherpassword")
        share_data = {"share_type": "view", "expires_hours": None, "password": None, "max_downloads": None}
        
        response = client.post(f"/drive/share/{file_id}", json=share_data, headers=other_user_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_analytics_without_ownership(self, client, auth_headers, db_session, create_test_user):
        """Test that only owners can view analytics."""
        # Upload a file and create share as first user
        test_content = b"Analytics ownership test"
        test_file = io.BytesIO(test_content)
        test_file.name = "analytics_ownership.txt"
        test_file.content_type = "text/plain"
        
        files = {"file": ("analytics_ownership.txt", test_file, "text/plain")}
        data = {"folder_id": ""}
        
        upload_response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view", "expires_hours": None, "password": None, "max_downloads": None}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_id = share_response.json()["share_id"]
        
        # Try to view analytics as different user
        other_user_headers = create_test_user("other2@example.com", "otherpassword2")
        response = client.get(f"/drive/share/{share_id}/analytics", headers=other_user_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND
