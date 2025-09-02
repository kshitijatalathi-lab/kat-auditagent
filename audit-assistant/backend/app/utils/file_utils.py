"""File handling utilities for document processing."""
import os
import mimetypes
from pathlib import Path
from typing import IO, Dict, Optional, Tuple, Union

from fastapi import UploadFile, HTTPException, status

# Supported file types and their corresponding content types
SUPPORTED_FILE_TYPES = {
    # Document formats
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.rtf': 'application/rtf',
    '.odt': 'application/vnd.oasis.opendocument.text',
    
    # Spreadsheet formats
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
    
    # Presentation formats
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.odp': 'application/vnd.oasis.opendocument.presentation',
}

# Maximum file size (50MB)
MAX_FILE_SIZE = 50 * 1024 * 1024


def get_file_extension(filename: str) -> str:
    """Get the file extension in lowercase."""
    return os.path.splitext(filename)[1].lower()


def is_file_type_supported(filename: str) -> bool:
    """Check if the file type is supported."""
    ext = get_file_extension(filename)
    return ext in SUPPORTED_FILE_TYPES


def get_content_type(filename: str) -> Optional[str]:
    """Get the content type for a file based on its extension."""
    ext = get_file_extension(filename)
    return SUPPORTED_FILE_TYPES.get(ext)


def validate_file(file: UploadFile) -> Tuple[bool, str]:
    """
    Validate the uploaded file.
    
    Args:
        file: The uploaded file
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Check file extension
    if not is_file_type_supported(file.filename):
        ext = get_file_extension(file.filename)
        return False, f"File type '{ext}' is not supported"
    
    # Check file size
    file.file.seek(0, 2)  # Move to end of file
    file_size = file.file.tell()
    file.file.seek(0)  # Reset file pointer
    
    if file_size > MAX_FILE_SIZE:
        return False, f"File size exceeds the maximum limit of {MAX_FILE_SIZE/(1024*1024):.1f}MB"
    
    # TODO: Add virus scanning in production
    
    return True, ""


def save_upload_file(upload_file: UploadFile, destination: Union[str, Path]) -> Path:
    """
    Save an uploaded file to the specified destination.
    
    Args:
        upload_file: The uploaded file
        destination: Directory path where the file should be saved
        
    Returns:
        Path to the saved file
    """
    destination_path = Path(destination)
    destination_path.mkdir(parents=True, exist_ok=True)
    
    file_path = destination_path / upload_file.filename
    
    # Handle potential filename conflicts
    counter = 1
    while file_path.exists():
        name = f"{file_path.stem}_{counter}{file_path.suffix}"
        file_path = file_path.with_name(name)
        counter += 1
    
    # Save the file
    with open(file_path, "wb") as buffer:
        buffer.write(upload_file.file.read())
    
    return file_path


def delete_file(file_path: Union[str, Path]) -> bool:
    """
    Delete a file if it exists.
    
    Args:
        file_path: Path to the file to delete
        
    Returns:
        True if the file was deleted, False if it didn't exist
    """
    file_path = Path(file_path)
    if file_path.exists():
        file_path.unlink()
        return True
    return False


def get_file_metadata(file_path: Union[str, Path]) -> Dict[str, str]:
    """
    Get metadata for a file.
    
    Args:
        file_path: Path to the file
        
    Returns:
        Dictionary containing file metadata
    """
    file_path = Path(file_path)
    return {
        'filename': file_path.name,
        'extension': file_path.suffix.lower(),
        'size': file_path.stat().st_size,
        'content_type': mimetypes.guess_type(file_path)[0] or 'application/octet-stream',
        'created': file_path.stat().st_ctime,
        'modified': file_path.stat().st_mtime,
    }
