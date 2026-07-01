"""
Google Drive photo/document upload using OAuth2 refresh token.

One-time setup:
1. Run:  python get_drive_token.py
2. Sign in with the Google account that owns the Drive folder.
3. Copy the printed refresh token into backend/.env as:
       GOOGLE_DRIVE_REFRESH_TOKEN=<token>
4. Also set: GOOGLE_DRIVE_FOLDER_ID=<folder id from Drive URL>

When either setting is missing the service degrades gracefully —
upload calls return (None, None) so the photo slot stays empty
rather than crashing the employee create/update flow.
"""

import io
import logging

logger = logging.getLogger(__name__)


def _build_drive_service():
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
        from app.core.config import settings

        if not settings.GOOGLE_DRIVE_REFRESH_TOKEN:
            logger.warning("GOOGLE_DRIVE_REFRESH_TOKEN not set — Drive uploads disabled")
            return None

        creds = Credentials(
            token=None,
            refresh_token=settings.GOOGLE_DRIVE_REFRESH_TOKEN,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
            scopes=["https://www.googleapis.com/auth/drive"],
        )
        # Force a refresh so we have a valid access token
        creds.refresh(Request())

        return build("drive", "v3", credentials=creds, cache_discovery=False)
    except Exception as exc:
        logger.warning("Could not build Drive service: %s", exc)
        return None


def upload_photo(file_bytes: bytes, filename: str, mime_type: str) -> tuple[str | None, str | None]:
    """
    Upload *file_bytes* to the configured Drive folder.

    Returns (public_url, file_id) on success or (None, None) on failure.
    """
    from app.core.config import settings

    folder_id = settings.GOOGLE_DRIVE_FOLDER_ID
    if not folder_id:
        logger.warning("GOOGLE_DRIVE_FOLDER_ID not set — Drive uploads disabled")
        return None, None

    service = _build_drive_service()
    if service is None:
        return None, None

    try:
        from googleapiclient.http import MediaIoBaseUpload

        file_metadata = {"name": filename, "parents": [folder_id]}
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

        # Thumbnail URL embeds directly in <img> without redirect
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
