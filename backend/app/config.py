import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Database
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "5432")
    DB_USER: str = os.getenv("DB_USER", "oxlas_user")
    DB_PASS: str = os.getenv("DB_PASS", "oxlas_password")
    DB_NAME: str = os.getenv("DB_NAME", "oxlas_suite")
    
    # JWT
    JWT_SECRET: str = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    
    # Application
    APP_NAME: str = "Oxlas Suite Backend"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # ClamAV Virus Scanner
    CLAMAV_HOST: str = os.getenv("CLAMAV_HOST", "localhost")
    CLAMAV_PORT: int = int(os.getenv("CLAMAV_PORT", "3310"))
    CLAMAV_TIMEOUT: int = int(os.getenv("CLAMAV_TIMEOUT", "60"))
    CLAMAV_ENABLED: bool = os.getenv("CLAMAV_ENABLED", "true").lower() == "true"
    
    # File Storage
    DRIVE_STORAGE_PATH: str = os.getenv("DRIVE_STORAGE_PATH", "drive_storage")
    MAX_FILE_SIZE_MB: int = int(os.getenv("MAX_FILE_SIZE_MB", "500"))
    QUARANTINE_PATH: str = os.getenv("QUARANTINE_PATH", "drive_storage/quarantine")
    
    # Sharing Settings
    DEFAULT_SHARE_EXPIRY_HOURS: int = int(os.getenv("DEFAULT_SHARE_EXPIRY_HOURS", "168"))  # 7 days
    MAX_SHARE_DOWNLOADS: int = int(os.getenv("MAX_SHARE_DOWNLOADS", "100"))
    
    @property
    def DATABASE_URL(self) -> str:
        # Use SQLite for local development without Docker
        return "sqlite:///./oxlas_backend.db"
    
    class Config:
        env_file = ".env"

settings = Settings()
