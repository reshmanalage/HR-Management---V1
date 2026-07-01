"""
Google Drive photo upload using a service account.

Setup (one-time):
1. In Google Cloud Console → IAM → Service Accounts → create a service account.
2. Create a JSON key and download it. Save it as backend/service_account.json.
3. In Google Drive, create a folder (e.g. "HRMS Employee Photos").
4. Share that folder with the service account email (Editor permission).
5. Copy the folder ID from its URL and set GOOGLE_DRIVE_FOLDER_ID in .env.

When GOOGLE_DRIVE_FOLDER_ID or the credentials file are missing the service
falls back gracefully — upload calls return None so the photo slot stays empty
rather than crashing the whole employee create/update flow.
"""

import io
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_CREDENTIALS_PATH = Path(__file__).resolve().parents[2] / "service_account.json"


def _build_drive_service():
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        if not _CREDENTIALS_PATH.exists():
            logger.warning("service_account.json not found — Drive uploads disabled")
            return None

        creds = service_account.Credentials.from_service_account_file(
            str(_CREDENTIALS_PATH),
            scopes=["https://www.googleapis.com/auth/drive"],
        )
        return build("drive", "v3", credentials=creds, cache_discovery=False)
    except Exception as exc:
        logger.warning("Could not build Drive service: %s", exc)
        return None


def upload_photo(file_bytes: bytes, filename: str, mime_type: str) -> tuple[str | None, str | None]:
    """
    Upload *file_bytes* to the configured Drive folder.

    Returns (public_url, file_id) on success or (None, None) when Drive is
    not configured or the upload fails.
    """
    from app.core.config import settings

    folder_id = getattr(settings, "GOOGLE_DRIVE_FOLDER_ID", None)
    if not folder_id:
        logger.warning("GOOGLE_DRIVE_FOLDER_ID not set — Drive uploads disabled")
        return None, None

    service = _build_drive_service()
    if service is None:
        return None, None

    try:
        from googleapiclient.http import MediaIoBaseUpload

        file_metadata = {
            "name": filename,
            "parents": [folder_id],
        }
        media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type, resumable=False)

        uploaded = (
            service.files()
            .create(body=file_metadata, media_body=media, fields="id")
            .execute()
        )
        file_id = uploaded.get("id")

        # Make file publicly readable (anyone with link)
        service.permissions().create(
            fileId=file_id,
            body={"type": "anyone", "role": "reader"},
        ).execute()

        # Use the direct thumbnail URL so it embeds in <img> without redirect
        public_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w400"
        return public_url, file_id
    except Exception as exc:
        logger.exception("Drive upload failed: %s", exc)
        return None, None


def delete_photo(file_id: str) -> None:
    service = _build_drive_service()
    if service is None:
        return
    try:
        service.files().delete(fileId=file_id).execute()
    except Exception as exc:
        logger.warning("Drive delete failed for %s: %s", file_id, exc)
