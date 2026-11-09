import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Input } from "../components/common/FormFields";
import { AuthLayout } from "../components/common/AuthLayout";
import { authApi } from "../services/auth";
import { isValidEmail } from "../utils/validation";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [unverified, setUnverified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resendState, setResendState] = useState("idle");

  const submit = async e => {
    e.preventDefault();
    if (!isValidEmail(form.email) || !form.password) return setError("Enter your email and password.");
    setSubmitting(true);
    setError(null);
    setUnverified(false);
    const result = await login(form.email.trim(), form.password);
    setSubmitting(false);
    if (result.ok) return navigate(location.state?.from?.pathname || "/overview", { replace: true });
    if (result.reason === "unverified") setUnverified(true);
    setError(result.message);
  };

  const resend = async () => {
    setResendState("sending");
    try {
      await authApi.resendVerification(form.email.trim());
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  };

  return (
    <AuthLayout subtitle="Administrator sign in" title="Welcome back" onSubmit={submit}>
      <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} required />
      <Input label="Password" type="password" autoComplete="current-password" value={form.password} onChange={v => setForm(p => ({ ...p, password: v }))} required />
      {error && <div className="form-error" role="alert">{error}</div>}
      {unverified && (
        <p className="auth-note">
          Didn't receive the email?{" "}
          <button type="button" className="link-btn" onClick={resend} disabled={resendState === "sending" || resendState === "sent"}>
            {resendState === "sending" ? "Sending..." : resendState === "sent" ? "Verification email sent" : resendState === "error" ? "Try again" : "Resend verification email"}
          </button>
        </p>
      )}
      <button className="btn btn-primary btn-block" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</button>
      <div className="auth-switch">
        Need an administrator account? <Link to="/register">Register</Link>
        <br />
        Study hub member? <Link to="/client/login">Client sign in</Link>
      </div>
    </AuthLayout>
  );
}
