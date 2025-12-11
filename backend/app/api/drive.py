"""
Drive API Endpoints

This module provides REST API endpoints for the drive service including:
- File upload/download with chunked upload support
- Folder management
- Secure sharing with password protection and download limits
- Share analytics
- Storage statistics
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import aiofiles
import tempfile
import os

from app.models import get_db, User
from app.api.auth import get_current_user
from app.services.drive import drive_service
from app.utils import get_logger
from app.plans import PlanFeatures

router = APIRouter()
security = HTTPBearer()
logger = get_logger(__name__)


# Request/Response Models
class FolderCreateRequest(BaseModel):
    name: str
    parent_id: Optional[int] = None


class ShareCreateRequest(BaseModel):
    share_type: str = "view"  # "view" or "edit"
    expires_hours: Optional[int] = None
    password: Optional[str] = None
    max_downloads: Optional[int] = None


class SharePasswordVerifyRequest(BaseModel):
    password: str


class FileResponse(BaseModel):
    id: int
    name: str
    file_size: int
    mime_type: str
    virus_scan_status: str
    created_at: str


class FolderResponse(BaseModel):
    id: int
    name: str
    path: str
    created_at: str


class DriveListResponse(BaseModel):
    folders: List[FolderResponse]
    files: List[FileResponse]


def get_client_info(request: Request) -> tuple:
    """Extract client information from request for audit logging."""
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    referer = request.headers.get("referer")
    return ip_address, user_agent, referer


# File Upload Endpoints
@router.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    folder_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload file to drive.
    
    - **file**: The file to upload
    - **folder_id**: Optional parent folder ID
    
    Returns upload result with file ID and metadata.
    """
    try:
        # Check file size limits
        plan_features = PlanFeatures.get_plan_features(current_user.plan.value)
        max_upload_size = plan_features["max_upload_size_mb"]
        
        if max_upload_size != "unlimited" and file.size > max_upload_size * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds limit of {max_upload_size}MB"
            )
        
        ip_address, user_agent, _ = get_client_info(request)
        
        result = await drive_service.upload_file(
            user_id=current_user.id,
            file=file,
            folder_id=folder_id,
            db=db,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file"
        )


@router.post("/upload-chunked")
async def upload_file_chunked(
    request: Request,
    chunk_data: UploadFile = File(...),
    chunk_number: int = Form(...),
    total_chunks: int = Form(...),
    original_filename: str = Form(...),
    mime_type: str = Form(...),
    folder_id: Optional[int] = Form(None),
    upload_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload file in chunks for large file support.
    
    - **chunk_data**: The chunk data
    - **chunk_number**: Current chunk number (0-indexed)
    - **total_chunks**: Total number of chunks
    - **original_filename**: Original file name
    - **mime_type**: File MIME type
    - **folder_id**: Optional parent folder ID
    - **upload_id**: Upload session ID (generated on first chunk)
    
    Returns upload progress or final result when complete.
    """
    try:
        # Read chunk data
        chunk_content = await chunk_data.read()
        
        ip_address, user_agent, _ = get_client_info(request)
        
        result = await drive_service.upload_file_chunked(
            user_id=current_user.id,
            chunk_data=chunk_content,
            chunk_number=chunk_number,
            total_chunks=total_chunks,
            original_filename=original_filename,
            mime_type=mime_type,
            folder_id=folder_id,
            upload_id=upload_id,
            db=db,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error uploading chunked file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload chunked file"
        )


# File Download Endpoint
@router.get("/download/{file_id}")
async def download_file(
    file_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download file from drive.
    
    - **file_id**: ID of the file to download
    
    Returns the file for download.
    """
    try:
        ip_address, user_agent, _ = get_client_info(request)
        
        result = await drive_service.download_file(
            file_id, 
            current_user.id, 
            db,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result.get("message", "File not found")
            )
        
        from fastapi.responses import FileResponse as FastAPIFileResponse
        
        return FastAPIFileResponse(
            path=result["file_path"],
            filename=result["filename"],
            media_type=result["mime_type"]
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error downloading file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download file"
        )


# File Delete Endpoint
@router.delete("/files/{file_id}")
async def delete_file(
    file_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete file from drive (soft delete).
    
    - **file_id**: ID of the file to delete
    
    Returns success message.
    """
    try:
        ip_address, user_agent, _ = get_client_info(request)
        
        result = await drive_service.delete_file(
            file_id, 
            current_user.id, 
            db,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result.get("message", "File not found")
            )
        
        return result
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error deleting file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete file"
        )


# Folder Endpoints
@router.post("/folders")
async def create_folder(
    request: FolderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create folder.
    
    - **name**: Folder name
    - **parent_id**: Optional parent folder ID
    
    Returns created folder details.
    """
    try:
        result = await drive_service.create_folder(
            user_id=current_user.id,
            name=request.name,
            parent_id=request.parent_id,
            db=db
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error creating folder: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create folder"
        )


# File Listing Endpoint
@router.get("/list")
async def list_files(
    folder_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List files and folders.
    
    - **folder_id**: Optional folder ID to list contents of (root if not provided)
    
    Returns list of files and folders.
    """
    try:
        result = await drive_service.list_files(
            user_id=current_user.id,
            folder_id=folder_id,
            db=db
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error listing files: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list files"
        )


# Share Link Endpoints
@router.post("/share/{file_id}")
async def create_share_link(
    file_id: int,
    request_body: ShareCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create share link for file with enhanced security options.
    
    - **file_id**: ID of file to share
    - **share_type**: Type of share ("view" or "edit")
    - **expires_hours**: Optional hours until expiration
    - **password**: Optional password protection
    - **max_downloads**: Optional download limit
    
    Returns share link details.
    """
    try:
        ip_address, user_agent, _ = get_client_info(request)
        
        result = await drive_service.create_share_link(
            file_id=file_id,
            user_id=current_user.id,
            share_type=request_body.share_type,
            expires_hours=request_body.expires_hours,
            password=request_body.password,
            max_downloads=request_body.max_downloads,
            db=db,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return result
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error creating share link: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create share link"
        )


@router.get("/share/{share_token}/info")
async def get_share_info(
    share_token: str,
    db: Session = Depends(get_db)
):
    """
    Get information about a share link without downloading.
    
    - **share_token**: Share token
    
    Returns share link information including file details and requirements.
    """
    try:
        result = await drive_service.get_share_info(share_token, db)
        
        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result.get("message", "Share link not found")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting share info: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get share info"
        )


@router.post("/share/{share_token}/verify-password")
async def verify_share_password(
    share_token: str,
    request_body: SharePasswordVerifyRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Verify password for a password-protected share link.
    
    - **share_token**: Share token
    - **password**: Password to verify
    
    Returns verification result with temporary access token.
    """
    try:
        ip_address, user_agent, _ = get_client_info(request)
        
        result = await drive_service.verify_share_password(
            share_token=share_token,
            password=request_body.password,
            db=db,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=result.get("message", "Password verification failed")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying share password: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify password"
        )


@router.get("/share/{share_token}")
async def access_shared_file(
    share_token: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Access file via share link (no authentication required).
    
    - **share_token**: Share token
    
    Returns the file for download if accessible.
    """
    try:
        ip_address, user_agent, referer = get_client_info(request)
        
        result = await drive_service.get_shared_file(
            share_token, 
            db,
            ip_address=ip_address,
            user_agent=user_agent,
            referer=referer
        )
        
        if not result["success"]:
            # Check if password is required
            if result.get("requires_password"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Password required",
                    headers={"X-Requires-Password": "true"}
                )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result.get("message", "Share link not found")
            )
        
        from fastapi.responses import FileResponse as FastAPIFileResponse
        
        response = FastAPIFileResponse(
            path=result["file_path"],
            filename=result["filename"],
            media_type=result["mime_type"]
        )
        
        # Add download remaining header if applicable
        if result.get("downloads_remaining") is not None:
            response.headers["X-Downloads-Remaining"] = str(result["downloads_remaining"])
        
        return response
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error accessing shared file: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to access shared file"
        )


@router.get("/share/{share_id}/analytics")
async def get_share_analytics(
    share_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get analytics for a share link (requires ownership).
    
    - **share_id**: Share ID
    
    Returns analytics including downloads, visitors, and access logs.
    """
    try:
        result = await drive_service.get_share_analytics(
            share_id=share_id,
            user_id=current_user.id,
            db=db
        )
        
        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result.get("message", "Share not found")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting share analytics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get share analytics"
        )


@router.delete("/share/{share_id}")
async def revoke_share_link(
    share_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Revoke a share link (requires ownership).
    
    - **share_id**: Share ID
    
    Returns success message.
    """
    try:
        result = await drive_service.revoke_share(
            share_id=share_id,
            user_id=current_user.id,
            db=db
        )
        
        if not result["success"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result.get("message", "Share not found")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error revoking share link: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to revoke share link"
        )


# Storage Statistics Endpoint
@router.get("/storage-stats")
async def get_storage_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get storage statistics for the current user.
    
    Returns storage usage, limits, file counts, and usage percentage.
    """
    try:
        result = await drive_service.get_storage_stats(current_user.id, db)
        return result
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error getting storage stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get storage stats"
        )


# Virus Scan Status Endpoint
@router.get("/files/{file_id}/scan-status")
async def get_file_scan_status(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get virus scan status for a file.
    
    - **file_id**: ID of the file
    
    Returns scan status and details.
    """
    from app.models import DriveFile
    
    try:
        file_record = db.query(DriveFile).filter(
            DriveFile.id == file_id,
            DriveFile.user_id == current_user.id,
            DriveFile.is_deleted == False
        ).first()
        
        if not file_record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found"
            )
        
        return {
            "file_id": file_id,
            "filename": file_record.original_name,
            "virus_scan_status": file_record.virus_scan_status,
            "is_safe": file_record.virus_scan_status == "clean",
            "is_scanning": file_record.virus_scan_status == "pending"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting scan status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get scan status"
        )


# ClamAV Status Endpoint (Admin)
@router.get("/system/clamav-status")
async def get_clamav_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get ClamAV service status (for monitoring).
    
    Returns ClamAV availability and version.
    """
    from app.services.drive.virus_scanner import clamav_scanner
    
    try:
        is_available = clamav_scanner.ping()
        version = clamav_scanner.get_version() if is_available else None
        
        return {
            "clamav_enabled": clamav_scanner.enabled,
            "clamav_available": is_available,
            "clamav_version": version,
            "host": clamav_scanner.host,
            "port": clamav_scanner.port
        }
        
    except Exception as e:
        logger.error(f"Error getting ClamAV status: {str(e)}")
        return {
            "clamav_enabled": clamav_scanner.enabled,
            "clamav_available": False,
            "error": str(e)
        }
