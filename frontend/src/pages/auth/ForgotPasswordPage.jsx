import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { forgotPassword } from "../../services/authService";

export default function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm();
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(values) {
    await forgotPassword(values.email);
    // Always show the same confirmation, whether or not the email exists,
    // so this form can't be used to discover which emails are registered.
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">Check your email</h2>
        <p className="text-sm text-gray-600">
          If an account exists for that email, a password reset link has been sent.
        </p>
        <Link to="/login" className="text-sm text-blue-600 hover:underline mt-4 inline-block">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Forgot Password</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            {...register("email", { required: "Email is required" })}
          />
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gray-900 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? "Sending..." : "Send reset link"}
        </button>

        <Link to="/login" className="text-sm text-blue-600 hover:underline block text-center">
          Back to sign in
        </Link>
      </form>
    </div>
  );
}
