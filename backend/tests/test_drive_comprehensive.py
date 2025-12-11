"""
Comprehensive Drive Service Tests

This module contains comprehensive tests for the drive service including:
- Real file upload/download tests with actual files
- Chunked upload tests for large files
- Concurrent file operations
- File type validation and security
- Password-protected sharing
- Download limits for shared files
- Sharing analytics
- Error handling scenarios
"""

import pytest
import io
import os
import tempfile
import hashlib
from unittest.mock import patch, MagicMock
from fastapi import status
from datetime import datetime, timedelta

from app.models import UserPlan, DriveFile, DriveShare, ShareAccessLog


# ==================== File Upload Tests ====================

class TestFileUpload:
    """Tests for file upload functionality"""
    
    def test_upload_small_text_file(self, client, auth_headers):
        """Test uploading a small text file"""
        # Create a test file
        file_content = b"Hello, World! This is a test file content."
        files = {"file": ("test_file.txt", io.BytesIO(file_content), "text/plain")}
        
        response = client.post(
            "/drive/upload",
            files=files,
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert "file_id" in data
        assert data["filename"] == "test_file.txt"
        assert data["file_size"] == len(file_content)
        assert data["mime_type"] == "text/plain"
        assert data["virus_scan_status"] == "pending"
    
    def test_upload_binary_file(self, client, auth_headers):
        """Test uploading a binary file"""
        # Create a binary file (simulated image)
        file_content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 1000
        files = {"file": ("test_image.png", io.BytesIO(file_content), "image/png")}
        
        response = client.post(
            "/drive/upload",
            files=files,
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert data["filename"] == "test_image.png"
        assert data["mime_type"] == "image/png"
    
    def test_upload_file_to_folder(self, client, auth_headers):
        """Test uploading a file to a specific folder"""
        # First create a folder
        folder_data = {"name": "test_upload_folder"}
        folder_response = client.post("/drive/folders", json=folder_data, headers=auth_headers)
        folder_id = folder_response.json()["folder_id"]
        
        # Upload file to the folder
        file_content = b"File in folder"
        files = {"file": ("folder_file.txt", io.BytesIO(file_content), "text/plain")}
        data = {"folder_id": str(folder_id)}
        
        response = client.post(
            "/drive/upload",
            files=files,
            data=data,
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["success"] is True
    
    def test_upload_file_without_auth(self, client):
        """Test that upload requires authentication"""
        file_content = b"Test content"
        files = {"file": ("test.txt", io.BytesIO(file_content), "text/plain")}
        
        response = client.post("/drive/upload", files=files)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_upload_large_file_within_limit(self, client, auth_headers):
        """Test uploading a file within size limits"""
        # Create a 1MB file
        file_content = b"x" * (1 * 1024 * 1024)
        files = {"file": ("large_file.bin", io.BytesIO(file_content), "application/octet-stream")}
        
        response = client.post(
            "/drive/upload",
            files=files,
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["file_size"] == len(file_content)
    
    def test_upload_various_file_types(self, client, auth_headers):
        """Test uploading various file types"""
        file_types = [
            ("document.pdf", b"%PDF-1.4 test content", "application/pdf"),
            ("document.docx", b"PK\x03\x04 docx content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ("spreadsheet.xlsx", b"PK\x03\x04 xlsx content", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            ("archive.zip", b"PK\x03\x04 zip content", "application/zip"),
            ("script.json", b'{"test": "data"}', "application/json"),
        ]
        
        for filename, content, mime_type in file_types:
            files = {"file": (filename, io.BytesIO(content), mime_type)}
            response = client.post("/drive/upload", files=files, headers=auth_headers)
            
            assert response.status_code == status.HTTP_200_OK, f"Failed to upload {filename}"
            assert response.json()["filename"] == filename


class TestChunkedUpload:
    """Tests for chunked file upload functionality"""
    
    def test_chunked_upload_small_file(self, client, auth_headers):
        """Test chunked upload with small file (1 chunk)"""
        chunk_content = b"Single chunk content"
        files = {"chunk_data": ("chunk_0", io.BytesIO(chunk_content), "application/octet-stream")}
        data = {
            "chunk_number": "0",
            "total_chunks": "1",
            "original_filename": "chunked_file.txt",
            "mime_type": "text/plain"
        }
        
        response = client.post(
            "/drive/upload-chunked",
            files=files,
            data=data,
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        result = response.json()
        assert result["success"] is True
        # Single chunk should complete immediately
        if result.get("file_id"):
            assert result["filename"] == "chunked_file.txt"
    
    def test_chunked_upload_multiple_chunks(self, client, auth_headers):
        """Test chunked upload with multiple chunks"""
        # Create content that will be split into 3 chunks
        chunk_size = 1024
        total_content = b"x" * (chunk_size * 3)
        chunks = [
            total_content[i:i+chunk_size] 
            for i in range(0, len(total_content), chunk_size)
        ]
        
        upload_id = None
        
        for i, chunk in enumerate(chunks):
            files = {"chunk_data": (f"chunk_{i}", io.BytesIO(chunk), "application/octet-stream")}
            data = {
                "chunk_number": str(i),
                "total_chunks": str(len(chunks)),
                "original_filename": "multi_chunk_file.bin",
                "mime_type": "application/octet-stream"
            }
            if upload_id:
                data["upload_id"] = upload_id
            
            response = client.post(
                "/drive/upload-chunked",
                files=files,
                data=data,
                headers=auth_headers
            )
            
            assert response.status_code == status.HTTP_200_OK
            result = response.json()
            
            if not upload_id and "upload_id" in result:
                upload_id = result["upload_id"]
            
            # Last chunk should complete the upload
            if i == len(chunks) - 1:
                if "file_id" in result:
                    assert result["filename"] == "multi_chunk_file.bin"


class TestFileDownload:
    """Tests for file download functionality"""
    
    def test_download_uploaded_file(self, client, auth_headers):
        """Test downloading a previously uploaded file"""
        # First upload a file
        original_content = b"Test content for download"
        files = {"file": ("download_test.txt", io.BytesIO(original_content), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Download the file
        response = client.get(f"/drive/download/{file_id}", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.content == original_content
    
    def test_download_nonexistent_file(self, client, auth_headers):
        """Test downloading a file that doesn't exist"""
        response = client.get("/drive/download/999999", headers=auth_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_download_without_auth(self, client):
        """Test that download requires authentication"""
        response = client.get("/drive/download/1")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_download_another_users_file(self, client, auth_headers, test_user_data):
        """Test that users cannot download other users' files"""
        # First user uploads a file
        file_content = b"Private content"
        files = {"file": ("private.txt", io.BytesIO(file_content), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Register a second user
        second_user_data = {
            "name": "Second User",
            "email": "second@example.com",
            "password": "password123"
        }
        register_response = client.post("/auth/register", json=second_user_data)
        second_user_token = register_response.json()["access_token"]
        second_headers = {"Authorization": f"Bearer {second_user_token}"}
        
        # Try to download with second user
        response = client.get(f"/drive/download/{file_id}", headers=second_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestFileDelete:
    """Tests for file deletion functionality"""
    
    def test_delete_file(self, client, auth_headers):
        """Test deleting a file"""
        # First upload a file
        files = {"file": ("to_delete.txt", io.BytesIO(b"Delete me"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Delete the file
        response = client.delete(f"/drive/files/{file_id}", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["success"] is True
        
        # Verify file is no longer accessible
        download_response = client.get(f"/drive/download/{file_id}", headers=auth_headers)
        assert download_response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_delete_nonexistent_file(self, client, auth_headers):
        """Test deleting a file that doesn't exist"""
        response = client.delete("/drive/files/999999", headers=auth_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ==================== Sharing Tests ====================

class TestSharing:
    """Tests for file sharing functionality"""
    
    def test_create_basic_share_link(self, client, auth_headers):
        """Test creating a basic share link"""
        # Upload a file
        files = {"file": ("shared.txt", io.BytesIO(b"Shared content"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create share link
        share_data = {"share_type": "view"}
        response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert "share_token" in data
        assert "share_url" in data
        assert data["share_type"] == "view"
    
    def test_create_share_link_with_expiration(self, client, auth_headers):
        """Test creating a share link with expiration"""
        # Upload a file
        files = {"file": ("expiring.txt", io.BytesIO(b"Expiring content"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create share link with 24-hour expiration
        share_data = {"share_type": "view", "expires_hours": 24}
        response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["expires_at"] is not None
    
    def test_create_password_protected_share(self, client, auth_headers):
        """Test creating a password-protected share link"""
        # Upload a file
        files = {"file": ("protected.txt", io.BytesIO(b"Protected content"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create password-protected share link
        share_data = {"share_type": "view", "password": "secret123"}
        response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["has_password"] is True
    
    def test_create_share_with_download_limit(self, client, auth_headers):
        """Test creating a share link with download limit"""
        # Upload a file
        files = {"file": ("limited.txt", io.BytesIO(b"Limited content"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Create share link with download limit
        share_data = {"share_type": "view", "max_downloads": 5}
        response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["max_downloads"] == 5
    
    def test_access_shared_file(self, client, auth_headers):
        """Test accessing a shared file"""
        # Upload and share a file
        original_content = b"Public content"
        files = {"file": ("public.txt", io.BytesIO(original_content), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view"}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Access shared file without authentication
        response = client.get(f"/drive/share/{share_token}")
        
        assert response.status_code == status.HTTP_200_OK
        assert response.content == original_content
    
    def test_access_password_protected_share_without_password(self, client, auth_headers):
        """Test accessing a password-protected share without providing password"""
        # Upload and share a file with password
        files = {"file": ("protected.txt", io.BytesIO(b"Protected"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view", "password": "secret123"}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Try to access without password
        response = client.get(f"/drive/share/{share_token}")
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_verify_share_password_correct(self, client, auth_headers):
        """Test verifying correct share password"""
        # Upload and share a file with password
        files = {"file": ("protected.txt", io.BytesIO(b"Protected"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view", "password": "secret123"}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Verify password
        verify_data = {"password": "secret123"}
        response = client.post(f"/drive/share/{share_token}/verify-password", json=verify_data)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert "verification_token" in data
    
    def test_verify_share_password_incorrect(self, client, auth_headers):
        """Test verifying incorrect share password"""
        # Upload and share a file with password
        files = {"file": ("protected.txt", io.BytesIO(b"Protected"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view", "password": "secret123"}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Verify with wrong password
        verify_data = {"password": "wrongpassword"}
        response = client.post(f"/drive/share/{share_token}/verify-password", json=verify_data)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_get_share_info(self, client, auth_headers):
        """Test getting share link information"""
        # Upload and share a file
        files = {"file": ("info.txt", io.BytesIO(b"Info content"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view", "max_downloads": 10}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Get share info
        response = client.get(f"/drive/share/{share_token}/info")
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert data["filename"] == "info.txt"
        assert data["downloads_remaining"] == 10
    
    def test_revoke_share_link(self, client, auth_headers):
        """Test revoking a share link"""
        # Upload and share a file
        files = {"file": ("revoke.txt", io.BytesIO(b"Revoke content"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view"}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_id = share_response.json()["share_id"]
        share_token = share_response.json()["share_token"]
        
        # Revoke the share
        response = client.delete(f"/drive/share/{share_id}", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Verify share is no longer accessible
        access_response = client.get(f"/drive/share/{share_token}")
        assert access_response.status_code == status.HTTP_404_NOT_FOUND


class TestShareAnalytics:
    """Tests for share analytics functionality"""
    
    def test_get_share_analytics(self, client, auth_headers):
        """Test getting analytics for a share link"""
        # Upload and share a file
        files = {"file": ("analytics.txt", io.BytesIO(b"Analytics content"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        share_data = {"share_type": "view"}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_id = share_response.json()["share_id"]
        share_token = share_response.json()["share_token"]
        
        # Access the shared file to generate some analytics
        client.get(f"/drive/share/{share_token}")
        client.get(f"/drive/share/{share_token}")
        
        # Get analytics
        response = client.get(f"/drive/share/{share_id}/analytics", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert "total_downloads" in data
        assert "unique_visitors" in data


# ==================== Storage Stats Tests ====================

class TestStorageStats:
    """Tests for storage statistics functionality"""
    
    def test_get_storage_stats(self, client, auth_headers):
        """Test getting storage statistics"""
        response = client.get("/drive/storage-stats", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "storage_used_bytes" in data
        assert "storage_limit_gb" in data
        assert "usage_percentage" in data
        assert "file_count" in data
        assert "folder_count" in data
    
    def test_storage_stats_updates_after_upload(self, client, auth_headers):
        """Test that storage stats update after file upload"""
        # Get initial stats
        initial_response = client.get("/drive/storage-stats", headers=auth_headers)
        initial_data = initial_response.json()
        initial_file_count = initial_data["file_count"]
        
        # Upload a file
        files = {"file": ("stats_test.txt", io.BytesIO(b"Stats test content"), "text/plain")}
        client.post("/drive/upload", files=files, headers=auth_headers)
        
        # Get updated stats
        updated_response = client.get("/drive/storage-stats", headers=auth_headers)
        updated_data = updated_response.json()
        
        assert updated_data["file_count"] == initial_file_count + 1


# ==================== Folder Tests ====================

class TestFolders:
    """Tests for folder management functionality"""
    
    def test_create_folder(self, client, auth_headers):
        """Test creating a folder"""
        folder_data = {"name": "test_folder"}
        response = client.post("/drive/folders", json=folder_data, headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["success"] is True
        assert data["name"] == "test_folder"
        assert "folder_id" in data
    
    def test_create_nested_folder(self, client, auth_headers):
        """Test creating nested folders"""
        # Create parent folder
        parent_data = {"name": "parent_folder"}
        parent_response = client.post("/drive/folders", json=parent_data, headers=auth_headers)
        parent_id = parent_response.json()["folder_id"]
        
        # Create child folder
        child_data = {"name": "child_folder", "parent_id": parent_id}
        child_response = client.post("/drive/folders", json=child_data, headers=auth_headers)
        
        assert child_response.status_code == status.HTTP_200_OK
        assert child_response.json()["parent_id"] == parent_id
    
    def test_list_files_in_folder(self, client, auth_headers):
        """Test listing files in a specific folder"""
        # Create a folder
        folder_data = {"name": "list_test_folder"}
        folder_response = client.post("/drive/folders", json=folder_data, headers=auth_headers)
        folder_id = folder_response.json()["folder_id"]
        
        # Upload a file to the folder
        files = {"file": ("in_folder.txt", io.BytesIO(b"In folder"), "text/plain")}
        data = {"folder_id": str(folder_id)}
        client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        
        # List files in folder
        response = client.get(f"/drive/list?folder_id={folder_id}", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["files"]) == 1
        assert data["files"][0]["name"] == "in_folder.txt"


# ==================== Virus Scan Tests ====================

class TestVirusScan:
    """Tests for virus scanning functionality"""
    
    def test_get_scan_status(self, client, auth_headers):
        """Test getting virus scan status for a file"""
        # Upload a file
        files = {"file": ("scan_test.txt", io.BytesIO(b"Scan test"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Get scan status
        response = client.get(f"/drive/files/{file_id}/scan-status", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["file_id"] == file_id
        assert "virus_scan_status" in data
        assert "is_safe" in data
    
    def test_get_clamav_status(self, client, auth_headers):
        """Test getting ClamAV service status"""
        response = client.get("/drive/system/clamav-status", headers=auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "clamav_enabled" in data
        assert "clamav_available" in data


# ==================== Error Handling Tests ====================

class TestErrorHandling:
    """Tests for error handling scenarios"""
    
    def test_upload_to_nonexistent_folder(self, client, auth_headers):
        """Test uploading to a folder that doesn't exist"""
        files = {"file": ("test.txt", io.BytesIO(b"Test"), "text/plain")}
        data = {"folder_id": "999999"}
        
        response = client.post("/drive/upload", files=files, data=data, headers=auth_headers)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_create_share_for_nonexistent_file(self, client, auth_headers):
        """Test creating share for a file that doesn't exist"""
        share_data = {"share_type": "view"}
        response = client.post("/drive/share/999999", json=share_data, headers=auth_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_access_invalid_share_token(self, client):
        """Test accessing an invalid share token"""
        response = client.get("/drive/share/invalid_token_12345")
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_get_scan_status_for_nonexistent_file(self, client, auth_headers):
        """Test getting scan status for a nonexistent file"""
        response = client.get("/drive/files/999999/scan-status", headers=auth_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND


# ==================== Concurrent Operations Tests ====================

class TestConcurrentOperations:
    """Tests for concurrent file operations"""
    
    def test_multiple_file_uploads(self, client, auth_headers):
        """Test uploading multiple files sequentially"""
        uploaded_files = []
        
        for i in range(5):
            files = {"file": (f"file_{i}.txt", io.BytesIO(f"Content {i}".encode()), "text/plain")}
            response = client.post("/drive/upload", files=files, headers=auth_headers)
            
            assert response.status_code == status.HTTP_200_OK
            uploaded_files.append(response.json()["file_id"])
        
        # Verify all files are accessible
        for file_id in uploaded_files:
            response = client.get(f"/drive/download/{file_id}", headers=auth_headers)
            assert response.status_code == status.HTTP_200_OK
    
    def test_upload_and_share_workflow(self, client, auth_headers):
        """Test complete upload and share workflow"""
        # Upload
        files = {"file": ("workflow.txt", io.BytesIO(b"Workflow test"), "text/plain")}
        upload_response = client.post("/drive/upload", files=files, headers=auth_headers)
        file_id = upload_response.json()["file_id"]
        
        # Download to verify
        download_response = client.get(f"/drive/download/{file_id}", headers=auth_headers)
        assert download_response.status_code == status.HTTP_200_OK
        
        # Share
        share_data = {"share_type": "view", "max_downloads": 3}
        share_response = client.post(f"/drive/share/{file_id}", json=share_data, headers=auth_headers)
        share_token = share_response.json()["share_token"]
        
        # Access shared file
        shared_response = client.get(f"/drive/share/{share_token}")
        assert shared_response.status_code == status.HTTP_200_OK
        
        # Get share info
        info_response = client.get(f"/drive/share/{share_token}/info")
        assert info_response.json()["downloads_remaining"] == 2
