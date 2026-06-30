import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../../services/authService";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState("verifying");

  useEffect(() => {
    if (!token) {
      setStatus("missing");
      return;
    }
    verifyEmail(token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  if (status === "verifying") {
    return <p className="text-sm text-gray-500">Verifying your email...</p>;
  }

  if (status === "missing") {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Verify Email</h2>
        <p className="text-sm text-red-600">No verification token found in the link.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Verify Email</h2>
        <p className="text-sm text-red-600">
          This verification link is invalid or has expired. Request a new one from your dashboard.
        </p>
        <Link to="/login" className="text-sm text-blue-600 hover:underline mt-4 inline-block">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Email verified</h2>
      <p className="text-sm text-gray-600">Your email has been verified.</p>
      <Link to="/login" className="text-sm text-blue-600 hover:underline mt-4 inline-block">
        Continue to sign in
      </Link>
    </div>
  );
}
