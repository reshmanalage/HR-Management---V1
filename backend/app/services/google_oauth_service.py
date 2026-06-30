from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.core.exceptions import InvalidTokenError
from app.core.security import generate_opaque_token

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


class GoogleProfile:
    def __init__(self, *, google_id: str, email: str, email_verified: bool, name: str | None):
        self.google_id = google_id
        self.email = email
        self.email_verified = email_verified
        self.name = name


class GoogleOAuthService:
    def build_authorization_url(self) -> tuple[str, str]:
        state = generate_opaque_token()
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
        return f"{GOOGLE_AUTH_URL}?{urlencode(params)}", state

    def exchange_code_for_profile(self, code: str) -> GoogleProfile:
        token_response = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
        if token_response.status_code != 200:
            raise InvalidTokenError("Failed to exchange Google authorization code")

        access_token = token_response.json().get("access_token")
        if not access_token:
            raise InvalidTokenError("Google did not return an access token")

        userinfo_response = httpx.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if userinfo_response.status_code != 200:
            raise InvalidTokenError("Failed to fetch Google profile")

        data = userinfo_response.json()
        return GoogleProfile(
            google_id=data["sub"],
            email=data["email"],
            email_verified=data.get("email_verified", False),
            name=data.get("name"),
        )
