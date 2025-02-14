import boto3
from botocore.client import Config
from core.config import settings
import logging
from typing import Optional
import io
import botocore.exceptions

logger = logging.getLogger(__name__)

class StorageHandler:
    def __init__(self):
        """Initialize MinIO client with configuration from settings."""
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.MINIO_HOST_URL,
            aws_access_key_id=settings.MINIO_ROOT_USER,
            aws_secret_access_key=settings.MINIO_ROOT_PASSWORD,
            config=Config(signature_version="s3v4"),

        )
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self) -> None:
        """Ensure the configured bucket exists, create if it doesn't."""
        try:
            self.client.head_bucket(Bucket=settings.MINIO_BUCKET_NAME)
        except botocore.exceptions.ClientError:
            try:
                self.client.create_bucket(Bucket=settings.MINIO_BUCKET_NAME)
                logger.info(f"Created bucket: {settings.MINIO_BUCKET_NAME}")
            except Exception as e:
                logger.error(f"Failed to create bucket: {str(e)}")

                raise

    async def upload_file(self, bucket_name: str, object_name: str, file_data: bytes) -> None:
        """
        Upload a file to MinIO.
        
        Args:
            bucket_name: Name of the bucket
            object_name: Name of the object (file path in bucket)
            file_data: Bytes of the file to upload
        """
        try:
            self.client.upload_fileobj(
                io.BytesIO(file_data),
                bucket_name,
                object_name
            )
            logger.info(f"Successfully uploaded file to {object_name}")
        except Exception as e:
            logger.error(f"Failed to upload file: {str(e)}")
            raise

    async def download_file(self, bucket_name: str, object_name: str) -> bytes:
        """
        Download a file from Storage.
        
        Args:
            bucket_name: Name of the bucket
            object_name: Name of the object to download
            
        Returns:
            bytes: The file content
        """
        try:
            file_obj = io.BytesIO()
            self.client.download_fileobj(
                bucket_name,
                object_name,
                file_obj
            )
            return file_obj.getvalue()
        except Exception as e:
            logger.error(f"Failed to download file {object_name}: {str(e)}")
            raise

    async def delete_file(self, bucket_name: str, object_name: str) -> None:
        """
        Delete a file from Storage.
        
        Args:
            bucket_name: Name of the bucket
            object_name: Name of the object to delete
        """
        try:
            self.client.delete_object(
                Bucket=bucket_name,
                Key=object_name
            )
            logger.info(f"Successfully deleted file {object_name}")
        except Exception as e:
            logger.error(f"Failed to delete file {object_name}: {str(e)}")
            raise

    async def list_files(self, bucket_name: str, prefix: Optional[str] = None) -> list:
        """
        List files in a bucket, optionally filtered by prefix.
        
        Args:
            bucket_name: Name of the bucket
            prefix: Optional prefix to filter objects
            
        Returns:
            list: List of object information dictionaries
        """
        try:
            if prefix:
                response = self.client.list_objects_v2(
                    Bucket=bucket_name,
                    Prefix=prefix
                )
            else:
                response = self.client.list_objects_v2(
                    Bucket=bucket_name
                )
            
            return response.get('Contents', [])
        except Exception as e:
            logger.error(f"Failed to list files: {str(e)}")
            raise 