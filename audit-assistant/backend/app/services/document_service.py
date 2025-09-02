"""Document storage and management service."""
import hashlib
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.core.config import settings
from app.db.base import Base
from app.models.document import DocumentStatus
from app.utils.file_utils import (
    delete_file, get_file_metadata, save_upload_file, validate_file
)
from .document_processor import DocumentProcessor

logger = logging.getLogger(__name__)

class DocumentService:
    """Service for document storage and management."""
    
    def __init__(self, db: Session):
        """Initialize the document service with a database session."""
        self.db = db
        self.processor = DocumentProcessor()
        
        # Ensure upload directory exists
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
    
    def upload_document(
        self,
        file: bytes,
        filename: str,
        organization_id: int,
        uploaded_by: int,
        metadata: Optional[Dict] = None,
    ) -> models.Document:
        """
        Upload and process a document.
        
        Args:
            file: The file content as bytes
            filename: Original filename
            organization_id: ID of the organization that owns the document
            uploaded_by: ID of the user who uploaded the document
            metadata: Optional metadata for the document
            
        Returns:
            The created Document model instance
        """
        # Create a temporary file for processing
        temp_path = self.upload_dir / f"temp_{int(datetime.utcnow().timestamp())}_{filename}"
        
        try:
            # Save the file temporarily
            with open(temp_path, "wb") as f:
                f.write(file)
            
            # Process the document
            doc_info = self.processor.process_file(temp_path)
            
            # Generate a unique filename
            file_hash = self._calculate_file_hash(temp_path)
            file_ext = Path(filename).suffix.lower()
            unique_filename = f"{file_hash}{file_ext}"
            
            # Move to final location
            final_path = self.upload_dir / unique_filename
            shutil.move(temp_path, final_path)
            
            # Create document record
            document_in = {
                "filename": filename,
                "storage_path": str(final_path.relative_to(settings.UPLOAD_DIR)),
                "content_type": doc_info['content_type'],
                "file_size": doc_info['file_size'],
                "page_count": doc_info['page_count'],
                "organization_id": organization_id,
                "uploaded_by": uploaded_by,
                "status": DocumentStatus.PROCESSED.value,
                "metadata": metadata or {},
            }
            
            document = crud.document.create(self.db, obj_in=document_in)
            
            # Extract and store text content
            self._store_document_content(document, doc_info['content'])
            
            return document
            
        except Exception as e:
            # Clean up temp file if it exists
            if temp_path.exists():
                temp_path.unlink()
            logger.error(f"Error uploading document: {e}")
            raise
    
    def get_document_content(self, document_id: int) -> Optional[str]:
        """
        Get the text content of a document.
        
        Args:
            document_id: ID of the document
            
        Returns:
            The document content as text, or None if not found
        """
        document = crud.document.get(self.db, id=document_id)
        if not document:
            return None
            
        # Check if content is already extracted
        if document.content:
            return document.content
            
        # Extract content if not already done
        try:
            file_path = self.upload_dir / document.storage_path
            doc_info = self.processor.process_file(file_path)
            
            # Update document with extracted content
            document.content = doc_info['content']
            self.db.commit()
            self.db.refresh(document)
            
            return document.content
            
        except Exception as e:
            logger.error(f"Error getting document content: {e}")
            return None
    
    def delete_document(self, document_id: int) -> bool:
        """
        Delete a document and its associated files.
        
        Args:
            document_id: ID of the document to delete
            
        Returns:
            True if the document was deleted, False otherwise
        """
        document = crud.document.get(self.db, id=document_id)
        if not document:
            return False
            
        try:
            # Delete the file
            file_path = self.upload_dir / document.storage_path
            if file_path.exists():
                file_path.unlink()
                
            # Delete the database record
            crud.document.remove(self.db, id=document_id)
            
            return True
            
        except Exception as e:
            logger.error(f"Error deleting document {document_id}: {e}")
            return False
    
    def _store_document_content(self, document: models.Document, content: str) -> None:
        """
        Store the extracted text content of a document.
        
        Args:
            document: The document model instance
            content: The extracted text content
        """
        # In a real application, you might want to store large content in a separate table
        # or a dedicated document store. For simplicity, we'll store it directly in the model.
        document.content = content
        self.db.commit()
        self.db.refresh(document)
    
    @staticmethod
    def _calculate_file_hash(file_path: Path, chunk_size: int = 8192) -> str:
        """
        Calculate the SHA-256 hash of a file.
        
        Args:
            file_path: Path to the file
            chunk_size: Size of chunks to read at once
            
        Returns:
            The hexadecimal digest of the file's hash
        """
        sha256_hash = hashlib.sha256()
        
        with open(file_path, "rb") as f:
            # Read and update hash in chunks
            for chunk in iter(lambda: f.read(chunk_size), b""):
                sha256_hash.update(chunk)
                
        return sha256_hash.hexdigest()
