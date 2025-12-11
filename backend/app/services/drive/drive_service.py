"""
Drive Service

This module provides the core drive storage functionality including file upload/download,
folder management, sharing with password protection and download limits, and storage quota management.
"""

import os
import uuid
import hashlib
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import aiofiles
from fastapi import UploadFile, HTTPException, status
from passlib.context import CryptContext

from app.models import get_db, User, DriveFile, DriveFolder, DriveShare, ShareAccessLog, FileAccessAudit, UserUsage
from app.utils import get_logger
from app.config import settings
from app.plans import PlanFeatures

logger = get_logger(__name__)

# Password hashing context for share passwords
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class DriveService:
    """
    Core drive service for file operations and sharing.
    
    Features:
    - File upload/download with chunked upload support
    - Folder organization
    - Secure sharing with:
      - Password protection
      - Download limits
      - Expiration time
      - Access logging and analytics
    - Storage quota enforcement per plan
    - Virus scanning integration
    """
    
    def __init__(self):
        self.base_path = Path(settings.DRIVE_STORAGE_PATH)
        self.base_path.mkdir(exist_ok=True)
        
        # Create user directories
        self.user_storage = self.base_path / "users"
        self.user_storage.mkdir(exist_ok=True)
        
        # Create temp directory for chunked uploads
        self.temp_path = self.base_path / "temp"
        self.temp_path.mkdir(exist_ok=True)
        
        # Chunk size for large file uploads (10MB)
        self.chunk_size = 10 * 1024 * 1024
    
    async def upload_file(
        self,
        user_id: int,
        file: UploadFile,
        folder_id: Optional[int] = None,
        db=None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload file to drive.
        
        Args:
            user_id: ID of the user uploading the file
            file: The file to upload
            folder_id: Optional parent folder ID
            db: Database session
            ip_address: Client IP for audit logging
            user_agent: Client user agent for audit logging
            
        Returns:
            Dictionary with upload result details
        """
        if db is None:
            db = next(get_db())
        
        # Get user and check storage quota
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")
        
        # Check storage quota
        if not await self.check_storage_quota(user_id, file.size, db):
            raise ValueError("Storage quota exceeded")
        
        # Validate folder if provided
        if folder_id:
            folder = db.query(DriveFolder).filter(
                DriveFolder.id == folder_id,
                DriveFolder.user_id == user_id,
                DriveFolder.is_deleted == False
            ).first()
            if not folder:
                raise ValueError("Folder not found")
        
        # Generate unique filename
        file_extension = Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        
        # Create user directory if not exists
        user_dir = self.user_storage / str(user_id)
        user_dir.mkdir(exist_ok=True)
        
        file_path = user_dir / unique_filename
        
        # Calculate checksum
        checksum = await self.calculate_checksum(file)
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        # Create file record
        drive_file = DriveFile(
            user_id=user_id,
            folder_id=folder_id,
            name=unique_filename,
            original_name=file.filename,
            file_path=str(file_path),
            file_size=file.size,
            mime_type=file.content_type or "application/octet-stream",
            checksum=checksum,
            virus_scan_status="pending"
        )
        
        db.add(drive_file)
        db.commit()
        db.refresh(drive_file)
        
        # Update user storage usage
        await self.update_storage_usage(user_id, file.size, db)
        
        # Create audit log
        await self._create_audit_log(
            db=db,
            user_id=user_id,
            file_id=drive_file.id,
            action="upload",
            details={"filename": file.filename, "file_size": file.size},
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        # Queue virus scan
        from app.tasks.drive_tasks import scan_file_task
        scan_file_task.delay(drive_file.id)
        
        logger.info(f"File uploaded: {file.filename} for user {user_id}")
        
        return {
            "success": True,
            "file_id": drive_file.id,
            "filename": file.filename,
            "file_size": file.size,
            "mime_type": file.content_type,
            "checksum": checksum,
            "virus_scan_status": "pending"
        }
    
    async def upload_file_chunked(
        self,
        user_id: int,
        chunk_data: bytes,
        chunk_number: int,
        total_chunks: int,
        original_filename: str,
        mime_type: str,
        folder_id: Optional[int] = None,
        upload_id: Optional[str] = None,
        db=None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """Upload file in chunks for large file support."""
        if db is None:
            db = next(get_db())
        
        # Generate upload ID if not provided
        if not upload_id:
            upload_id = str(uuid.uuid4())
        
        # Create temporary directory for chunks
        temp_dir = self.temp_path / upload_id
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        # Save chunk
        chunk_path = temp_dir / f"chunk_{chunk_number:05d}"
        async with aiofiles.open(chunk_path, 'wb') as f:
            await f.write(chunk_data)
        
        # Check if all chunks are uploaded
        uploaded_chunks = len(list(temp_dir.glob("chunk_*")))
        
        if uploaded_chunks == total_chunks:
            # All chunks uploaded, combine them
            return await self.combine_chunks(
                user_id, temp_dir, original_filename, mime_type, folder_id, db,
                ip_address=ip_address, user_agent=user_agent
            )
        
        return {
            "success": True,
            "upload_id": upload_id,
            "chunk_number": chunk_number,
            "chunks_uploaded": uploaded_chunks,
            "total_chunks": total_chunks,
            "status": "uploading"
        }
    
    async def combine_chunks(
        self,
        user_id: int,
        temp_dir: Path,
        original_filename: str,
        mime_type: str,
        folder_id: Optional[int],
        db,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """Combine uploaded chunks into final file."""
        try:
            # Get user and check storage quota
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise ValueError("User not found")
            
            # Calculate total file size
            total_size = 0
            chunk_files = sorted(temp_dir.glob("chunk_*"), key=lambda x: x.name)
            
            for chunk_file in chunk_files:
                total_size += chunk_file.stat().st_size
            
            # Check storage quota
            if not await self.check_storage_quota(user_id, total_size, db):
                raise ValueError("Storage quota exceeded")
            
            # Generate unique filename
            file_extension = Path(original_filename).suffix
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            
            # Create user directory if not exists
            user_dir = self.user_storage / str(user_id)
            user_dir.mkdir(exist_ok=True)
            
            final_path = user_dir / unique_filename
            
            # Combine chunks
            async with aiofiles.open(final_path, 'wb') as final_file:
                for chunk_file in chunk_files:
                    async with aiofiles.open(chunk_file, 'rb') as chunk:
                        await final_file.write(await chunk.read())
            
            # Calculate checksum
            checksum = await self.calculate_file_checksum(final_path)
            
            # Create file record
            drive_file = DriveFile(
                user_id=user_id,
                folder_id=folder_id,
                name=unique_filename,
                original_name=original_filename,
                file_path=str(final_path),
                file_size=total_size,
                mime_type=mime_type,
                checksum=checksum,
                virus_scan_status="pending"
            )
            
            db.add(drive_file)
            db.commit()
            db.refresh(drive_file)
            
            # Update user storage usage
            await self.update_storage_usage(user_id, total_size, db)
            
            # Clean up temporary directory
            shutil.rmtree(temp_dir)
            
            # Create audit log
            await self._create_audit_log(
                db=db,
                user_id=user_id,
                file_id=drive_file.id,
                action="upload",
                details={"filename": original_filename, "file_size": total_size, "chunked": True},
                ip_address=ip_address,
                user_agent=user_agent
            )
            
            # Queue virus scan
            from app.tasks.drive_tasks import scan_file_task
            scan_file_task.delay(drive_file.id)
            
            logger.info(f"Chunked file upload completed: {original_filename} for user {user_id}")
            
            return {
                "success": True,
                "file_id": drive_file.id,
                "filename": original_filename,
                "file_size": total_size,
                "mime_type": mime_type,
                "checksum": checksum,
                "virus_scan_status": "pending"
            }
            
        except Exception as e:
            logger.error(f"Error combining chunks: {str(e)}")
            # Clean up temporary directory on error
            if temp_dir.exists():
                shutil.rmtree(temp_dir)
            raise
    
    async def download_file(
        self, 
        file_id: int, 
        user_id: int, 
        db=None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """Download file from drive."""
        if db is None:
            db = next(get_db())
        
        file_record = db.query(DriveFile).filter(
            DriveFile.id == file_id,
            DriveFile.user_id == user_id,
            DriveFile.is_deleted == False
        ).first()
        
        if not file_record:
            raise ValueError("File not found")
        
        if not os.path.exists(file_record.file_path):
            raise ValueError("File not found on disk")
        
        # Create audit log
        await self._create_audit_log(
            db=db,
            user_id=user_id,
            file_id=file_id,
            action="download",
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        return {
            "success": True,
            "file_path": file_record.file_path,
            "filename": file_record.original_name,
            "mime_type": file_record.mime_type,
            "file_size": file_record.file_size
        }
    
    async def delete_file(
        self, 
        file_id: int, 
        user_id: int, 
        db=None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """Delete file from drive (soft delete)."""
        if db is None:
            db = next(get_db())
        
        file_record = db.query(DriveFile).filter(
            DriveFile.id == file_id,
            DriveFile.user_id == user_id,
            DriveFile.is_deleted == False
        ).first()
        
        if not file_record:
            raise ValueError("File not found")
        
        # Mark as deleted (soft delete)
        file_record.is_deleted = True
        
        # Deactivate all shares for this file
        for share in file_record.shares:
            share.is_active = False
        
        db.commit()
        
        # Update storage usage
        await self.update_storage_usage(user_id, -file_record.file_size, db)
        
        # Create audit log
        await self._create_audit_log(
            db=db,
            user_id=user_id,
            file_id=file_id,
            action="delete",
            details={"filename": file_record.original_name},
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        logger.info(f"File deleted: {file_record.original_name} for user {user_id}")
        
        return {
            "success": True,
            "message": "File deleted successfully"
        }
    
    async def create_folder(
        self,
        user_id: int,
        name: str,
        parent_id: Optional[int] = None,
        db=None
    ) -> Dict[str, Any]:
        """Create folder."""
        if db is None:
            db = next(get_db())
        
        # Validate parent folder
        if parent_id:
            parent_folder = db.query(DriveFolder).filter(
                DriveFolder.id == parent_id,
                DriveFolder.user_id == user_id,
                DriveFolder.is_deleted == False
            ).first()
            
            if not parent_folder:
                raise ValueError("Parent folder not found")
        
        # Generate folder path
        if parent_id:
            parent_folder = db.query(DriveFolder).filter(DriveFolder.id == parent_id).first()
            parent_path = parent_folder.path or ""
            folder_path = f"{parent_path}/{name}" if parent_path else name
        else:
            folder_path = name
        
        # Create folder record
        folder = DriveFolder(
            user_id=user_id,
            parent_id=parent_id,
            name=name,
            path=folder_path
        )
        
        db.add(folder)
        db.commit()
        db.refresh(folder)
        
        logger.info(f"Folder created: {name} for user {user_id}")
        
        return {
            "success": True,
            "folder_id": folder.id,
            "name": name,
            "path": folder_path,
            "parent_id": parent_id
        }
    
    async def list_files(
        self,
        user_id: int,
        folder_id: Optional[int] = None,
        db=None
    ) -> Dict[str, Any]:
        """List files and folders in a directory."""
        if db is None:
            db = next(get_db())
        
        # Get folders
        folders_query = db.query(DriveFolder).filter(
            DriveFolder.user_id == user_id,
            DriveFolder.is_deleted == False
        )
        
        if folder_id is not None:
            folders_query = folders_query.filter(DriveFolder.parent_id == folder_id)
        else:
            folders_query = folders_query.filter(DriveFolder.parent_id.is_(None))
        
        folders = folders_query.all()
        
        # Get files
        files_query = db.query(DriveFile).filter(
            DriveFile.user_id == user_id,
            DriveFile.is_deleted == False
        )
        
        if folder_id is not None:
            files_query = files_query.filter(DriveFile.folder_id == folder_id)
        else:
            files_query = files_query.filter(DriveFile.folder_id.is_(None))
        
        files = files_query.all()
        
        return {
            "success": True,
            "folders": [
                {
                    "id": folder.id,
                    "name": folder.name,
                    "path": folder.path,
                    "created_at": folder.created_at.isoformat()
                }
                for folder in folders
            ],
            "files": [
                {
                    "id": file.id,
                    "name": file.original_name,
                    "file_size": file.file_size,
                    "mime_type": file.mime_type,
                    "virus_scan_status": file.virus_scan_status,
                    "created_at": file.created_at.isoformat()
                }
                for file in files
            ]
        }
    
    async def create_share_link(
        self,
        file_id: int,
        user_id: int,
        share_type: str = "view",
        expires_hours: Optional[int] = None,
        password: Optional[str] = None,
        max_downloads: Optional[int] = None,
        db=None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create share link for file with enhanced security options.
        
        Args:
            file_id: ID of the file to share
            user_id: ID of the file owner
            share_type: Type of share (view, edit)
            expires_hours: Optional hours until expiration
            password: Optional password protection
            max_downloads: Optional download limit
            db: Database session
            ip_address: Client IP for audit logging
            user_agent: Client user agent for audit logging
            
        Returns:
            Dictionary with share link details
        """
        if db is None:
            db = next(get_db())
        
        # Check file ownership
        file_record = db.query(DriveFile).filter(
            DriveFile.id == file_id,
            DriveFile.user_id == user_id,
            DriveFile.is_deleted == False
        ).first()
        
        if not file_record:
            raise ValueError("File not found")
        
        # Generate share token
        share_token = hashlib.sha256(
            f"{file_id}{user_id}{datetime.utcnow()}{uuid.uuid4()}".encode()
        ).hexdigest()
        
        # Calculate expiration
        expires_at = None
        if expires_hours:
            expires_at = datetime.utcnow() + timedelta(hours=expires_hours)
        
        # Hash password if provided
        password_hash = None
        if password:
            password_hash = pwd_context.hash(password)
        
        # Create share record
        share = DriveShare(
            file_id=file_id,
            share_token=share_token,
            share_type=share_type,
            expires_at=expires_at,
            password_hash=password_hash,
            max_downloads=max_downloads,
            download_count=0
        )
        
        db.add(share)
        db.commit()
        db.refresh(share)
        
        # Create audit log
        await self._create_audit_log(
            db=db,
            user_id=user_id,
            file_id=file_id,
            action="share",
            details={
                "share_id": share.id,
                "share_type": share_type,
                "has_password": password is not None,
                "has_expiration": expires_at is not None,
                "max_downloads": max_downloads
            },
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        logger.info(f"Share link created for file {file_id} by user {user_id}")
        
        return {
            "success": True,
            "share_id": share.id,
            "share_token": share_token,
            "share_url": f"/drive/share/{share_token}",
            "share_type": share_type,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "has_password": password is not None,
            "max_downloads": max_downloads
        }
    
    async def verify_share_password(
        self,
        share_token: str,
        password: str,
        db=None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Verify password for a protected share link.
        
        Returns verification token for subsequent download.
        """
        if db is None:
            db = next(get_db())
        
        share = db.query(DriveShare).filter(
            DriveShare.share_token == share_token,
            DriveShare.is_active == True
        ).first()
        
        if not share:
            return {"success": False, "message": "Share link not found"}
        
        if not share.password_hash:
            return {"success": False, "message": "This share link is not password protected"}
        
        # Verify password
        is_valid = pwd_context.verify(password, share.password_hash)
        
        # Log access attempt
        access_log = ShareAccessLog(
            share_id=share.id,
            access_type="password_attempt",
            success=is_valid,
            ip_address=ip_address,
            user_agent=user_agent
        )
        db.add(access_log)
        db.commit()
        
        if is_valid:
            # Generate verification token (valid for 30 minutes)
            verification_token = hashlib.sha256(
                f"{share_token}{datetime.utcnow()}{uuid.uuid4()}".encode()
            ).hexdigest()[:32]
            
            return {
                "success": True,
                "verification_token": verification_token,
                "expires_in_seconds": 1800
            }
        else:
            logger.warning(f"Failed password attempt for share {share.id} from IP {ip_address}")
            return {"success": False, "message": "Invalid password"}
    
    async def get_shared_file(
        self, 
        share_token: str, 
        db=None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referer: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get file via share link.
        
        Validates share link, checks download limits, logs access, and returns file info.
        """
        if db is None:
            db = next(get_db())
        
        share = db.query(DriveShare).filter(
            DriveShare.share_token == share_token,
            DriveShare.is_active == True
        ).first()
        
        if not share:
            # Log failed access attempt
            logger.warning(f"Invalid share token access attempt from IP {ip_address}")
            return {"success": False, "message": "Share link not found"}
        
        # Check expiration
        if share.expires_at and share.expires_at < datetime.utcnow():
            share.is_active = False
            db.commit()
            return {"success": False, "message": "Share link expired"}
        
        # Check download limit
        if share.max_downloads and share.download_count >= share.max_downloads:
            share.is_active = False
            db.commit()
            return {"success": False, "message": "Download limit reached"}
        
        # Check if password protected
        if share.password_hash:
            return {
                "success": False,
                "message": "Password required",
                "requires_password": True,
                "share_type": share.share_type
            }
        
        file_record = share.file
        
        if not file_record or file_record.is_deleted:
            return {"success": False, "message": "File not found"}
        
        if not os.path.exists(file_record.file_path):
            return {"success": False, "message": "File not found on disk"}
        
        # Update download count and access time
        share.download_count += 1
        share.accessed_at = datetime.utcnow()
        
        # Log access
        access_log = ShareAccessLog(
            share_id=share.id,
            access_type="download",
            success=True,
            ip_address=ip_address,
            user_agent=user_agent,
            referer=referer
        )
        db.add(access_log)
        db.commit()
        
        return {
            "success": True,
            "file_path": file_record.file_path,
            "filename": file_record.original_name,
            "mime_type": file_record.mime_type,
            "file_size": file_record.file_size,
            "share_type": share.share_type,
            "downloads_remaining": (share.max_downloads - share.download_count) if share.max_downloads else None
        }
    
    async def get_share_info(self, share_token: str, db=None) -> Dict[str, Any]:
        """Get information about a share link without downloading."""
        if db is None:
            db = next(get_db())
        
        share = db.query(DriveShare).filter(
            DriveShare.share_token == share_token,
            DriveShare.is_active == True
        ).first()
        
        if not share:
            return {"success": False, "message": "Share link not found"}
        
        # Check expiration
        if share.expires_at and share.expires_at < datetime.utcnow():
            return {"success": False, "message": "Share link expired"}
        
        # Check download limit
        if share.max_downloads and share.download_count >= share.max_downloads:
            return {"success": False, "message": "Download limit reached"}
        
        file_record = share.file
        
        return {
            "success": True,
            "filename": file_record.original_name if file_record else "Unknown",
            "file_size": file_record.file_size if file_record else 0,
            "mime_type": file_record.mime_type if file_record else None,
            "share_type": share.share_type,
            "requires_password": share.password_hash is not None,
            "expires_at": share.expires_at.isoformat() if share.expires_at else None,
            "downloads_remaining": (share.max_downloads - share.download_count) if share.max_downloads else None
        }
    
    async def get_share_analytics(self, share_id: int, user_id: int, db=None) -> Dict[str, Any]:
        """Get analytics for a share link."""
        if db is None:
            db = next(get_db())
        
        # Verify ownership
        share = db.query(DriveShare).filter(DriveShare.id == share_id).first()
        if not share:
            return {"success": False, "message": "Share not found"}
        
        if share.file.user_id != user_id:
            return {"success": False, "message": "Access denied"}
        
        # Get access logs
        from sqlalchemy import func
        
        total_views = db.query(func.count(ShareAccessLog.id)).filter(
            ShareAccessLog.share_id == share_id,
            ShareAccessLog.access_type == "download",
            ShareAccessLog.success == True
        ).scalar()
        
        failed_password_attempts = db.query(func.count(ShareAccessLog.id)).filter(
            ShareAccessLog.share_id == share_id,
            ShareAccessLog.access_type == "password_attempt",
            ShareAccessLog.success == False
        ).scalar()
        
        unique_visitors = db.query(func.count(func.distinct(ShareAccessLog.ip_address))).filter(
            ShareAccessLog.share_id == share_id
        ).scalar()
        
        # Get recent access logs
        recent_logs = db.query(ShareAccessLog).filter(
            ShareAccessLog.share_id == share_id
        ).order_by(ShareAccessLog.created_at.desc()).limit(20).all()
        
        return {
            "success": True,
            "share_id": share_id,
            "file_name": share.file.original_name,
            "total_downloads": total_views or 0,
            "failed_password_attempts": failed_password_attempts or 0,
            "unique_visitors": unique_visitors or 0,
            "download_count": share.download_count,
            "max_downloads": share.max_downloads,
            "is_active": share.is_active,
            "has_password": share.password_hash is not None,
            "created_at": share.created_at.isoformat() if share.created_at else None,
            "expires_at": share.expires_at.isoformat() if share.expires_at else None,
            "recent_access": [
                {
                    "type": log.access_type,
                    "success": log.success,
                    "ip_address": log.ip_address,
                    "created_at": log.created_at.isoformat() if log.created_at else None
                }
                for log in recent_logs
            ]
        }
    
    async def revoke_share(self, share_id: int, user_id: int, db=None) -> Dict[str, Any]:
        """Revoke a share link."""
        if db is None:
            db = next(get_db())
        
        share = db.query(DriveShare).filter(DriveShare.id == share_id).first()
        if not share:
            return {"success": False, "message": "Share not found"}
        
        if share.file.user_id != user_id:
            return {"success": False, "message": "Access denied"}
        
        share.is_active = False
        db.commit()
        
        logger.info(f"Share link {share_id} revoked by user {user_id}")
        
        return {"success": True, "message": "Share link revoked"}
    
    async def check_storage_quota(self, user_id: int, file_size: int, db) -> bool:
        """Check if user has enough storage quota."""
        # Get user's current usage
        usage = db.query(UserUsage).filter(
            UserUsage.user_id == user_id,
            UserUsage.month == datetime.utcnow().strftime("%Y-%m")
        ).first()
        
        current_usage = usage.storage_used_bytes if usage else 0
        
        # Get user's plan
        user = db.query(User).filter(User.id == user_id).first()
        plan_features = PlanFeatures.get_plan_features(user.plan.value)
        
        storage_limit_gb = plan_features["storage_limit_gb"]
        
        if storage_limit_gb == "unlimited":
            return True
        
        storage_limit_bytes = storage_limit_gb * 1024 * 1024 * 1024
        return (current_usage + file_size) <= storage_limit_bytes
    
    async def update_storage_usage(self, user_id: int, size_change: int, db):
        """Update user's storage usage."""
        current_month = datetime.utcnow().strftime("%Y-%m")
        
        usage = db.query(UserUsage).filter(
            UserUsage.user_id == user_id,
            UserUsage.month == current_month
        ).first()
        
        if not usage:
            usage = UserUsage(
                user_id=user_id,
                month=current_month,
                storage_used_bytes=0
            )
            db.add(usage)
        
        usage.storage_used_bytes += size_change
        db.commit()
    
    async def calculate_checksum(self, file: UploadFile) -> str:
        """Calculate SHA-256 checksum of file."""
        sha256_hash = hashlib.sha256()
        
        # Reset file pointer
        await file.seek(0)
        
        # Read file in chunks to handle large files
        while chunk := await file.read(8192):
            sha256_hash.update(chunk)
        
        # Reset file pointer again
        await file.seek(0)
        
        return sha256_hash.hexdigest()
    
    async def calculate_file_checksum(self, file_path: Path) -> str:
        """Calculate SHA-256 checksum of file from path."""
        sha256_hash = hashlib.sha256()
        
        async with aiofiles.open(file_path, 'rb') as f:
            while chunk := await f.read(8192):
                sha256_hash.update(chunk)
        
        return sha256_hash.hexdigest()
    
    async def get_storage_stats(self, user_id: int, db=None) -> Dict[str, Any]:
        """Get storage statistics for user."""
        if db is None:
            db = next(get_db())
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")
        
        # Get current usage
        usage = db.query(UserUsage).filter(
            UserUsage.user_id == user_id,
            UserUsage.month == datetime.utcnow().strftime("%Y-%m")
        ).first()
        
        current_usage = usage.storage_used_bytes if usage else 0
        
        # Get plan limits
        plan_features = PlanFeatures.get_plan_features(user.plan.value)
        storage_limit_gb = plan_features["storage_limit_gb"]
        
        if storage_limit_gb == "unlimited":
            storage_limit_bytes = float('inf')
        else:
            storage_limit_bytes = storage_limit_gb * 1024 * 1024 * 1024
        
        # Count files and folders
        file_count = db.query(DriveFile).filter(
            DriveFile.user_id == user_id,
            DriveFile.is_deleted == False
        ).count()
        
        folder_count = db.query(DriveFolder).filter(
            DriveFolder.user_id == user_id,
            DriveFolder.is_deleted == False
        ).count()
        
        return {
            "user_id": user_id,
            "plan": user.plan.value,
            "storage_used_bytes": current_usage,
            "storage_limit_bytes": storage_limit_bytes if storage_limit_bytes != float('inf') else None,
            "storage_used_gb": current_usage / (1024 ** 3),
            "storage_limit_gb": storage_limit_gb,
            "usage_percentage": (current_usage / storage_limit_bytes * 100) if storage_limit_bytes != float('inf') else 0,
            "file_count": file_count,
            "folder_count": folder_count
        }
    
    async def _create_audit_log(
        self,
        db,
        user_id: int,
        file_id: int,
        action: str,
        details: Dict[str, Any] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Create an audit log entry for file access."""
        import json
        
        audit = FileAccessAudit(
            user_id=user_id,
            file_id=file_id,
            action=action,
            details=json.dumps(details) if details else None,
            ip_address=ip_address,
            user_agent=user_agent
        )
        
        db.add(audit)
        db.commit()


# Global drive service instance
drive_service = DriveService()
