"""
Temporary one-time router for getting the Google Drive refresh token.
Visit http://localhost:7000/api/v1/drive-setup/authorize in your browser.
Remove this file and its api_router entry once the token is in .env.
"""
import urllib.parse
import urllib.request
import json

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core.config import settings

router = APIRouter(prefix="/drive-setup", tags=["drive-setup"])

REDIRECT_URI = "http://localhost:7000/api/v1/drive-setup/callback"
SCOPE = "https://www.googleapis.com/auth/drive"


@router.get("/authorize")
def drive_authorize():
    params = urllib.parse.urlencode({
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/auth?{params}")


@router.get("/callback")
def drive_callback(code: str):
    data = urllib.parse.urlencode({
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    with urllib.request.urlopen(req) as resp:
        tokens = json.loads(resp.read())

    refresh_token = tokens.get("refresh_token", "ERROR — no refresh token returned")

    return HTMLResponse(f"""
    <html>
    <body style="font-family:monospace;padding:40px;background:#f9fafb;">
        <h2 style="color:#4f46e5;">Google Drive Token</h2>
        <p>Add this line to <strong>backend/.env</strong>:</p>
        <pre style="background:#1e1e1e;color:#4ade80;padding:20px;border-radius:8px;font-size:14px;user-select:all;">
GOOGLE_DRIVE_REFRESH_TOKEN={refresh_token}</pre>
        <p style="color:#6b7280;">Then restart the backend. You can delete
        <code>drive_setup_router.py</code> after this.</p>
    </body>
    </html>
    """)
