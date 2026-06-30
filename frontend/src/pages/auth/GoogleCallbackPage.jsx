import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function GoogleCallbackPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in dev; without this guard the second
    // run reads an already-cleared hash (since the first run already
    // navigated away) and incorrectly falls through to the failure path.
    if (handled.current) return;
    handled.current = true;

    // Tokens arrive in the URL fragment (not the query string) so they
    // never get sent to the server in a Referer header or access log.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");

    if (accessToken && refreshToken) {
      login({ access_token: accessToken, refresh_token: refreshToken });
      navigate("/", { replace: true });
    } else {
      navigate("/login?error=google_auth_failed", { replace: true });
    }
  }, [login, navigate]);

  return (
    <div>
      <p className="text-sm text-gray-500">Signing you in...</p>
    </div>
  );
}
