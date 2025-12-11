"""
Drive Service Background Tasks

This module contains Celery tasks for drive-related background processing,
including virus scanning, file cleanup, and share management.
"""

import os
from datetime import datetime, timedelta
from typing import Dict, Any

from celery import current_task
from app.celery_app import celery_app
from app.models import get_db, DriveFile, DriveShare
from app.utils import get_logger
from app.services.drive.virus_scanner import (
    clamav_scanner, 
    quarantine_manager, 
    ScanResult
)

logger = get_logger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def scan_file_task(self, file_id: int) -> Dict[str, Any]:
    """
    Scan file for viruses using ClamAV.
    
    This task:
    1. Retrieves the file from database
    2. Scans it using ClamAV daemon via INSTREAM command
    3. Updates the file status (clean/infected)
    4. Quarantines infected files
    
    Args:
        file_id: Database ID of the file to scan
        
    Returns:
        Dictionary with scan results
    """
    try:
        logger.info(f"Starting virus scan for file {file_id}")
        
        db = next(get_db())
        file_record = db.query(DriveFile).filter(DriveFile.id == file_id).first()
        
        if not file_record:
            raise ValueError(f"File {file_id} not found")
        
        # Check if file exists
        if not os.path.exists(file_record.file_path):
            raise ValueError(f"File {file_record.file_path} not found on disk")
        
        # Perform virus scan using ClamAV
        scan_result = clamav_scanner.scan_stream(file_record.file_path)
        
        # Handle scan results
        if scan_result.status == ScanResult.CLEAN:
            file_record.virus_scan_status = "clean"
            db.commit()
            
            logger.info(f"Virus scan completed for file {file_id}: clean")
            
            return {
                "success": True,
                "file_id": file_id,
                "scan_status": "clean",
                "scan_details": scan_result.details,
                "scan_time_ms": scan_result.scan_time_ms,
                "task_id": current_task.request.id
            }
            
        elif scan_result.status == ScanResult.INFECTED:
            file_record.virus_scan_status = "infected"
            db.commit()
            
            # Quarantine the infected file
            quarantine_result = quarantine_manager.quarantine_file(
                file_path=file_record.file_path,
                virus_name=scan_result.virus_name,
                file_id=file_id
            )
            
            logger.warning(
                f"Virus detected in file {file_id}: {scan_result.virus_name}. "
                f"File quarantined: {quarantine_result.get('quarantine_id')}"
            )
            
            return {
                "success": True,
                "file_id": file_id,
                "scan_status": "infected",
                "virus_name": scan_result.virus_name,
                "scan_details": scan_result.details,
                "scan_time_ms": scan_result.scan_time_ms,
                "quarantine_id": quarantine_result.get("quarantine_id"),
                "task_id": current_task.request.id
            }
            
        else:
            # Scan failed or error
            file_record.virus_scan_status = "scan_failed"
            db.commit()
            
            logger.error(f"Virus scan failed for file {file_id}: {scan_result.details}")
            
            # Retry the task
            raise Exception(f"Scan failed: {scan_result.details}")
        
    except Exception as e:
        logger.error(f"Failed to scan file {file_id}: {str(e)}")
        
        # Update file record to indicate scan failure
        try:
            db = next(get_db())
            file_record = db.query(DriveFile).filter(DriveFile.id == file_id).first()
            if file_record:
                file_record.virus_scan_status = "scan_failed"
                db.commit()
        except Exception as db_error:
            logger.error(f"Failed to update scan status: {db_error}")
        
        # Retry with exponential backoff
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))


@celery_app.task
def rescan_all_pending_files() -> Dict[str, Any]:
    """
    Rescan all files with pending or failed scan status.
    
    Useful for processing backlog after ClamAV becomes available.
    """
    try:
        db = next(get_db())
        
        # Find files needing scan
        pending_files = db.query(DriveFile).filter(
            DriveFile.virus_scan_status.in_(["pending", "scan_failed"]),
            DriveFile.is_deleted == False
        ).all()
        
        queued_count = 0
        for file_record in pending_files:
            scan_file_task.delay(file_record.id)
            queued_count += 1
        
        logger.info(f"Queued {queued_count} files for virus scanning")
        
        return {
            "success": True,
            "message": f"Queued {queued_count} files for scanning",
            "queued_count": queued_count
        }
        
    except Exception as e:
        logger.error(f"Failed to queue pending files for scan: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to queue files: {str(e)}"
        }


@celery_app.task
def cleanup_expired_shares() -> Dict[str, Any]:
    """
    Clean up expired share links.
    
    Deactivates share links that have passed their expiration time.
    """
    try:
        db = next(get_db())
        
        now = datetime.utcnow()
        
        # Find expired shares
        expired_shares = db.query(DriveShare).filter(
            DriveShare.expires_at < now,
            DriveShare.is_active == True
        ).all()
        
        # Deactivate expired shares
        for share in expired_shares:
            share.is_active = False
        
        db.commit()
        
        logger.info(f"Cleaned up {len(expired_shares)} expired share links")
        
        return {
            "success": True,
            "message": f"Cleaned up {len(expired_shares)} expired share links",
            "expired_count": len(expired_shares)
        }
        
    except Exception as e:
        logger.error(f"Failed to cleanup expired shares: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to cleanup expired shares: {str(e)}"
        }


@celery_app.task
def cleanup_exhausted_shares() -> Dict[str, Any]:
    """
    Clean up share links that have reached their download limit.
    """
    try:
        db = next(get_db())
        
        # Find shares that have reached their download limit
        exhausted_shares = db.query(DriveShare).filter(
            DriveShare.max_downloads.isnot(None),
            DriveShare.download_count >= DriveShare.max_downloads,
            DriveShare.is_active == True
        ).all()
        
        # Deactivate exhausted shares
        for share in exhausted_shares:
            share.is_active = False
        
        db.commit()
        
        logger.info(f"Cleaned up {len(exhausted_shares)} exhausted share links")
        
        return {
            "success": True,
            "message": f"Cleaned up {len(exhausted_shares)} exhausted share links",
            "exhausted_count": len(exhausted_shares)
        }
        
    except Exception as e:
        logger.error(f"Failed to cleanup exhausted shares: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to cleanup exhausted shares: {str(e)}"
        }


@celery_app.task
def cleanup_deleted_files() -> Dict[str, Any]:
    """
    Clean up deleted files from disk.
    
    Permanently deletes files that have been soft-deleted for more than 30 days.
    """
    try:
        db = next(get_db())
        
        # Find deleted files older than 30 days
        cutoff_date = datetime.utcnow() - timedelta(days=30)
        
        deleted_files = db.query(DriveFile).filter(
            DriveFile.is_deleted == True,
            DriveFile.updated_at < cutoff_date
        ).all()
        
        cleaned_count = 0
        
        for file_record in deleted_files:
            try:
                if os.path.exists(file_record.file_path):
                    os.remove(file_record.file_path)
                    cleaned_count += 1
                
                # Remove from database
                db.delete(file_record)
                
            except Exception as e:
                logger.error(f"Error deleting file {file_record.file_path}: {str(e)}")
        
        db.commit()
        
        logger.info(f"Cleaned up {cleaned_count} deleted files from disk")
        
        return {
            "success": True,
            "message": f"Cleaned up {cleaned_count} deleted files from disk",
            "cleaned_count": cleaned_count
        }
        
    except Exception as e:
        logger.error(f"Failed to cleanup deleted files: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to cleanup deleted files: {str(e)}"
        }


@celery_app.task
def cleanup_quarantined_files(days_old: int = 90) -> Dict[str, Any]:
    """
    Clean up old quarantined files.
    
    Permanently deletes quarantined files older than specified days.
    
    Args:
        days_old: Number of days after which quarantined files should be deleted
    """
    try:
        import json
        from pathlib import Path
        
        quarantine_path = quarantine_manager.quarantine_path
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        
        cleaned_count = 0
        
        for metadata_file in quarantine_path.glob("*.json"):
            try:
                with open(metadata_file, "r") as f:
                    metadata = json.load(f)
                
                quarantined_at = datetime.fromisoformat(metadata.get("quarantined_at", ""))
                
                if quarantined_at < cutoff_date:
                    quarantine_id = metadata.get("quarantine_id")
                    if quarantine_manager.delete_quarantined(quarantine_id):
                        cleaned_count += 1
                        
            except Exception as e:
                logger.error(f"Error processing quarantine file {metadata_file}: {e}")
        
        logger.info(f"Cleaned up {cleaned_count} old quarantined files")
        
        return {
            "success": True,
            "message": f"Cleaned up {cleaned_count} old quarantined files",
            "cleaned_count": cleaned_count
        }
        
    except Exception as e:
        logger.error(f"Failed to cleanup quarantined files: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to cleanup quarantined files: {str(e)}"
        }


@celery_app.task
def generate_share_analytics(share_id: int) -> Dict[str, Any]:
    """
    Generate analytics for a share link.
    
    Args:
        share_id: Database ID of the share
        
    Returns:
        Dictionary with analytics data
    """
    try:
        from sqlalchemy import func
        from app.models import ShareAccessLog
        
        db = next(get_db())
        
        share = db.query(DriveShare).filter(DriveShare.id == share_id).first()
        if not share:
            return {"success": False, "message": "Share not found"}
        
        # Get access logs statistics
        total_views = db.query(func.count(ShareAccessLog.id)).filter(
            ShareAccessLog.share_id == share_id,
            ShareAccessLog.access_type == "view",
            ShareAccessLog.success == True
        ).scalar()
        
        total_downloads = db.query(func.count(ShareAccessLog.id)).filter(
            ShareAccessLog.share_id == share_id,
            ShareAccessLog.access_type == "download",
            ShareAccessLog.success == True
        ).scalar()
        
        failed_password_attempts = db.query(func.count(ShareAccessLog.id)).filter(
            ShareAccessLog.share_id == share_id,
            ShareAccessLog.access_type == "password_attempt",
            ShareAccessLog.success == False
        ).scalar()
        
        # Get unique visitors (by IP)
        unique_visitors = db.query(func.count(func.distinct(ShareAccessLog.ip_address))).filter(
            ShareAccessLog.share_id == share_id
        ).scalar()
        
        # Get country distribution
        country_stats = db.query(
            ShareAccessLog.country,
            func.count(ShareAccessLog.id)
        ).filter(
            ShareAccessLog.share_id == share_id,
            ShareAccessLog.country.isnot(None)
        ).group_by(ShareAccessLog.country).all()
        
        return {
            "success": True,
            "share_id": share_id,
            "total_views": total_views or 0,
            "total_downloads": total_downloads or 0,
            "failed_password_attempts": failed_password_attempts or 0,
            "unique_visitors": unique_visitors or 0,
            "country_distribution": {country: count for country, count in country_stats},
            "download_count": share.download_count,
            "max_downloads": share.max_downloads,
            "is_active": share.is_active,
            "created_at": share.created_at.isoformat() if share.created_at else None,
            "expires_at": share.expires_at.isoformat() if share.expires_at else None
        }
        
    except Exception as e:
        logger.error(f"Failed to generate share analytics for {share_id}: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to generate analytics: {str(e)}"
        }


# Periodic task scheduling (to be configured in celery beat)
@celery_app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    """Configure periodic tasks"""
    
    # Cleanup expired shares every hour
    sender.add_periodic_task(
        3600.0,  # 1 hour
        cleanup_expired_shares.s(),
        name='cleanup-expired-shares'
    )
    
    # Cleanup exhausted shares every hour
    sender.add_periodic_task(
        3600.0,  # 1 hour
        cleanup_exhausted_shares.s(),
        name='cleanup-exhausted-shares'
    )
    
    # Cleanup deleted files daily
    sender.add_periodic_task(
        86400.0,  # 24 hours
        cleanup_deleted_files.s(),
        name='cleanup-deleted-files'
    )
    
    # Cleanup old quarantined files weekly
    sender.add_periodic_task(
        604800.0,  # 7 days
        cleanup_quarantined_files.s(90),
        name='cleanup-quarantined-files'
    )
    
    # Rescan pending files every 6 hours
    sender.add_periodic_task(
        21600.0,  # 6 hours
        rescan_all_pending_files.s(),
        name='rescan-pending-files'
    )
