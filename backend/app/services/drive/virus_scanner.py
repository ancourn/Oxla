"""
ClamAV Virus Scanner Service

This module provides real virus scanning capabilities using ClamAV daemon.
It supports both socket-based and TCP-based communication with ClamAV.
"""

import os
import socket
import struct
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

from app.config import settings
from app.utils import get_logger

logger = get_logger(__name__)


class ScanResult(str, Enum):
    CLEAN = "clean"
    INFECTED = "infected"
    ERROR = "scan_failed"
    PENDING = "pending"


@dataclass
class VirusScanResult:
    """Result of a virus scan operation"""
    status: ScanResult
    virus_name: Optional[str] = None
    details: Optional[str] = None
    file_path: Optional[str] = None
    scan_time_ms: Optional[float] = None


class ClamAVScanner:
    """
    ClamAV virus scanner client.
    
    Communicates with ClamAV daemon via TCP socket to scan files for viruses.
    Supports both INSTREAM and SCAN commands.
    """
    
    def __init__(
        self,
        host: str = None,
        port: int = None,
        timeout: int = None
    ):
        self.host = host or settings.CLAMAV_HOST
        self.port = port or settings.CLAMAV_PORT
        self.timeout = timeout or settings.CLAMAV_TIMEOUT
        self.enabled = settings.CLAMAV_ENABLED
        
        # Chunk size for streaming files to ClamAV (max 2GB)
        self.chunk_size = 8192
        
    def _create_socket(self) -> socket.socket:
        """Create a TCP socket connection to ClamAV daemon"""
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        sock.connect((self.host, self.port))
        return sock
    
    def ping(self) -> bool:
        """
        Check if ClamAV daemon is running and responsive.
        
        Returns:
            True if ClamAV responds with PONG, False otherwise
        """
        if not self.enabled:
            logger.warning("ClamAV is disabled in settings")
            return False
            
        try:
            sock = self._create_socket()
            try:
                sock.sendall(b"zPING\0")
                response = sock.recv(1024)
                return response.strip(b"\0") == b"PONG"
            finally:
                sock.close()
        except Exception as e:
            logger.error(f"ClamAV ping failed: {str(e)}")
            return False
    
    def get_version(self) -> Optional[str]:
        """
        Get ClamAV daemon version.
        
        Returns:
            Version string or None if unavailable
        """
        if not self.enabled:
            return None
            
        try:
            sock = self._create_socket()
            try:
                sock.sendall(b"zVERSION\0")
                response = sock.recv(1024)
                return response.strip(b"\0").decode("utf-8")
            finally:
                sock.close()
        except Exception as e:
            logger.error(f"Failed to get ClamAV version: {str(e)}")
            return None
    
    def scan_file(self, file_path: str) -> VirusScanResult:
        """
        Scan a file for viruses using SCAN command.
        
        This method requires ClamAV to have access to the file path.
        
        Args:
            file_path: Path to the file to scan
            
        Returns:
            VirusScanResult with scan status and details
        """
        import time
        start_time = time.time()
        
        if not self.enabled:
            logger.warning("ClamAV is disabled, skipping scan")
            return VirusScanResult(
                status=ScanResult.CLEAN,
                details="ClamAV disabled - scan skipped",
                file_path=file_path
            )
        
        if not os.path.exists(file_path):
            return VirusScanResult(
                status=ScanResult.ERROR,
                details=f"File not found: {file_path}",
                file_path=file_path
            )
        
        try:
            sock = self._create_socket()
            try:
                # Use SCAN command with null-terminated string
                command = f"zSCAN {file_path}\0".encode("utf-8")
                sock.sendall(command)
                
                # Read response
                response = sock.recv(4096)
                response_str = response.strip(b"\0").decode("utf-8")
                
                scan_time = (time.time() - start_time) * 1000
                
                return self._parse_scan_response(response_str, file_path, scan_time)
                
            finally:
                sock.close()
                
        except socket.timeout:
            logger.error(f"ClamAV scan timeout for file: {file_path}")
            return VirusScanResult(
                status=ScanResult.ERROR,
                details="Scan timeout",
                file_path=file_path
            )
        except Exception as e:
            logger.error(f"ClamAV scan error for {file_path}: {str(e)}")
            return VirusScanResult(
                status=ScanResult.ERROR,
                details=f"Scan error: {str(e)}",
                file_path=file_path
            )
    
    def scan_stream(self, file_path: str) -> VirusScanResult:
        """
        Scan a file by streaming its content to ClamAV using INSTREAM command.
        
        This method doesn't require ClamAV to have direct file access.
        
        Args:
            file_path: Path to the file to scan
            
        Returns:
            VirusScanResult with scan status and details
        """
        import time
        start_time = time.time()
        
        if not self.enabled:
            logger.warning("ClamAV is disabled, skipping scan")
            return VirusScanResult(
                status=ScanResult.CLEAN,
                details="ClamAV disabled - scan skipped",
                file_path=file_path
            )
        
        if not os.path.exists(file_path):
            return VirusScanResult(
                status=ScanResult.ERROR,
                details=f"File not found: {file_path}",
                file_path=file_path
            )
        
        try:
            sock = self._create_socket()
            try:
                # Send INSTREAM command
                sock.sendall(b"zINSTREAM\0")
                
                # Stream file content
                with open(file_path, "rb") as f:
                    while True:
                        chunk = f.read(self.chunk_size)
                        if not chunk:
                            break
                        # Send chunk size as 4-byte big-endian integer followed by data
                        size = struct.pack("!I", len(chunk))
                        sock.sendall(size + chunk)
                
                # Send zero-length chunk to indicate end of stream
                sock.sendall(struct.pack("!I", 0))
                
                # Read response
                response = sock.recv(4096)
                response_str = response.strip(b"\0").decode("utf-8")
                
                scan_time = (time.time() - start_time) * 1000
                
                return self._parse_scan_response(response_str, file_path, scan_time)
                
            finally:
                sock.close()
                
        except socket.timeout:
            logger.error(f"ClamAV stream scan timeout for file: {file_path}")
            return VirusScanResult(
                status=ScanResult.ERROR,
                details="Scan timeout",
                file_path=file_path
            )
        except Exception as e:
            logger.error(f"ClamAV stream scan error for {file_path}: {str(e)}")
            return VirusScanResult(
                status=ScanResult.ERROR,
                details=f"Scan error: {str(e)}",
                file_path=file_path
            )
    
    def scan_bytes(self, data: bytes) -> VirusScanResult:
        """
        Scan raw bytes for viruses using INSTREAM command.
        
        Args:
            data: Raw bytes to scan
            
        Returns:
            VirusScanResult with scan status and details
        """
        import time
        start_time = time.time()
        
        if not self.enabled:
            return VirusScanResult(
                status=ScanResult.CLEAN,
                details="ClamAV disabled - scan skipped"
            )
        
        try:
            sock = self._create_socket()
            try:
                # Send INSTREAM command
                sock.sendall(b"zINSTREAM\0")
                
                # Stream data in chunks
                offset = 0
                while offset < len(data):
                    chunk = data[offset:offset + self.chunk_size]
                    size = struct.pack("!I", len(chunk))
                    sock.sendall(size + chunk)
                    offset += self.chunk_size
                
                # Send zero-length chunk to indicate end of stream
                sock.sendall(struct.pack("!I", 0))
                
                # Read response
                response = sock.recv(4096)
                response_str = response.strip(b"\0").decode("utf-8")
                
                scan_time = (time.time() - start_time) * 1000
                
                return self._parse_scan_response(response_str, None, scan_time)
                
            finally:
                sock.close()
                
        except Exception as e:
            logger.error(f"ClamAV bytes scan error: {str(e)}")
            return VirusScanResult(
                status=ScanResult.ERROR,
                details=f"Scan error: {str(e)}"
            )
    
    def _parse_scan_response(
        self, 
        response: str, 
        file_path: Optional[str],
        scan_time_ms: float
    ) -> VirusScanResult:
        """
        Parse ClamAV scan response.
        
        Response format:
        - Clean: "path: OK"
        - Infected: "path: virus_name FOUND"
        - Error: "path: ERROR message"
        """
        logger.debug(f"ClamAV response: {response}")
        
        if "OK" in response:
            return VirusScanResult(
                status=ScanResult.CLEAN,
                details="No threats detected",
                file_path=file_path,
                scan_time_ms=scan_time_ms
            )
        elif "FOUND" in response:
            # Extract virus name
            parts = response.split(":")
            if len(parts) >= 2:
                virus_info = parts[-1].strip()
                virus_name = virus_info.replace("FOUND", "").strip()
            else:
                virus_name = "Unknown"
            
            logger.warning(f"Virus detected in {file_path}: {virus_name}")
            
            return VirusScanResult(
                status=ScanResult.INFECTED,
                virus_name=virus_name,
                details=f"Virus detected: {virus_name}",
                file_path=file_path,
                scan_time_ms=scan_time_ms
            )
        elif "ERROR" in response:
            return VirusScanResult(
                status=ScanResult.ERROR,
                details=f"Scan error: {response}",
                file_path=file_path,
                scan_time_ms=scan_time_ms
            )
        else:
            return VirusScanResult(
                status=ScanResult.ERROR,
                details=f"Unknown response: {response}",
                file_path=file_path,
                scan_time_ms=scan_time_ms
            )


class QuarantineManager:
    """
    Manages quarantined infected files.
    
    Moves infected files to a secure quarantine directory and tracks them.
    """
    
    def __init__(self, quarantine_path: str = None):
        self.quarantine_path = Path(quarantine_path or settings.QUARANTINE_PATH)
        self.quarantine_path.mkdir(parents=True, exist_ok=True)
    
    def quarantine_file(
        self, 
        file_path: str, 
        virus_name: str,
        file_id: int = None
    ) -> Dict[str, Any]:
        """
        Move infected file to quarantine.
        
        Args:
            file_path: Path to the infected file
            virus_name: Name of detected virus
            file_id: Optional database file ID
            
        Returns:
            Dictionary with quarantine details
        """
        import shutil
        import uuid
        from datetime import datetime
        
        try:
            source_path = Path(file_path)
            if not source_path.exists():
                return {
                    "success": False,
                    "error": "File not found"
                }
            
            # Generate unique quarantine filename
            quarantine_id = str(uuid.uuid4())
            quarantine_filename = f"{quarantine_id}_{source_path.name}"
            quarantine_file_path = self.quarantine_path / quarantine_filename
            
            # Move file to quarantine
            shutil.move(str(source_path), str(quarantine_file_path))
            
            # Create quarantine metadata
            metadata = {
                "quarantine_id": quarantine_id,
                "original_path": str(source_path),
                "quarantine_path": str(quarantine_file_path),
                "virus_name": virus_name,
                "file_id": file_id,
                "quarantined_at": datetime.utcnow().isoformat(),
                "success": True
            }
            
            # Write metadata file
            metadata_path = self.quarantine_path / f"{quarantine_id}.json"
            import json
            with open(metadata_path, "w") as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(f"File quarantined: {source_path} -> {quarantine_file_path}")
            
            return metadata
            
        except Exception as e:
            logger.error(f"Failed to quarantine file {file_path}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def list_quarantined(self) -> list:
        """List all quarantined files"""
        import json
        
        quarantined = []
        for metadata_file in self.quarantine_path.glob("*.json"):
            try:
                with open(metadata_file, "r") as f:
                    metadata = json.load(f)
                    quarantined.append(metadata)
            except Exception as e:
                logger.error(f"Error reading quarantine metadata {metadata_file}: {e}")
        
        return quarantined
    
    def delete_quarantined(self, quarantine_id: str) -> bool:
        """Permanently delete a quarantined file"""
        try:
            # Find and delete the quarantined file and metadata
            for file_path in self.quarantine_path.glob(f"{quarantine_id}_*"):
                os.remove(file_path)
            
            metadata_path = self.quarantine_path / f"{quarantine_id}.json"
            if metadata_path.exists():
                os.remove(metadata_path)
            
            logger.info(f"Deleted quarantined file: {quarantine_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete quarantined file {quarantine_id}: {str(e)}")
            return False


# Global instances
clamav_scanner = ClamAVScanner()
quarantine_manager = QuarantineManager()
