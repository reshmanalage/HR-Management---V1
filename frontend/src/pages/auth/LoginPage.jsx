import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { login as loginRequest } from "../../services/authService";
import { useAuth } from "../../context/AuthContext";

const GOOGLE_LOGIN_URL = `${import.meta.env.VITE_API_BASE_URL}/auth/google/login`;

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();
  const [serverError, setServerError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const googleAuthFailed = searchParams.get("error") === "google_auth_failed";

  async function onSubmit(values) {
    setServerError("");
    try {
      const tokens = await loginRequest(values);
      login(tokens);
      navigate("/");
    } catch (err) {
      setServerError(err.response?.data?.detail || "Login failed. Please try again.");
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Sign in</h2>

      {googleAuthFailed && (
        <p className="text-sm text-red-600 mb-4">
          Google sign-in failed. If you don't have an account yet, contact your administrator.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID or Email</label>
          <input
            type="text"
            placeholder="e.g. EMP0001 or you@company.com"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("email", { required: "Employee ID or email is required" })}
          />
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("password", { required: "Password is required" })}
          />
          {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center text-sm text-gray-600 gap-2">
            <input type="checkbox" {...register("remember_me")} />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
            Forgot password?
          </Link>
        </div>

        {serverError && <p className="text-sm text-red-600">{serverError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gray-900 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">OR</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <a
        href={GOOGLE_LOGIN_URL}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Sign in with Google
      </a>
    </div>
  );
}
