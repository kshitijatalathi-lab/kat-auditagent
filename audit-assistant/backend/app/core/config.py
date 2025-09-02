from pydantic_settings import BaseSettings
from typing import Optional, List
from pathlib import Path

class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Audit Assistant"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"
    SECRET_KEY: str = "your-secret-key-here"
    
    # API
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Audit Assistant API"
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["*"]
    
    # Database
    DATABASE_URL: str = "sqlite:///./audit_assistant.db"
    TEST_DATABASE_URL: str = "sqlite:///./test_audit_assistant.db"
    
    # Auth
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    JWT_ALGORITHM: str = "HS256"
    
    # LLM
    LLM_PROVIDER: str = "openai"  # openai, gemini, local, ollama
    OPENAI_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    
    # Document Processing
    UPLOAD_FOLDER: str = "./uploads"
    PROCESSED_FOLDER: str = "./data/processed"
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    
    # Vector Store
    VECTOR_STORE_PATH: str = "./data/vector_store"
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    
    class Config:
        case_sensitive = True
        env_file = ".env"
        env_file_encoding = 'utf-8'

settings = Settings()

# Create necessary directories
Path(settings.UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)
Path(settings.PROCESSED_FOLDER).mkdir(parents=True, exist_ok=True)
Path(settings.VECTOR_STORE_PATH).mkdir(parents=True, exist_ok=True)
