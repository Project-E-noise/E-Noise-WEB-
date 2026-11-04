import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Input } from "../components/common/FormFields";
import { authApi } from "../services/auth";

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
    setSubmitting(true);
    setError(null);
    setUnverified(false);
    const result = await login(form.email, form.password);
    setSubmitting(false);
    if (result.ok) {
      navigate(location.state?.from?.pathname || "/overview", { replace: true });
      return;
    }
    if (result.reason === "unverified") setUnverified(true);
    setError(result.message);
  };

  const resend = async () => {
    setResendState("sending");
    try {
      await authApi.resendVerification(form.email);
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  };

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="sb-logo">
            <i className="ti ti-wave-sine" />
          </div>
          <div>
            <div className="sb-name">E-Noise</div>
            <div className="sb-sub">Administrator sign in</div>
          </div>
        </div>
        <Input label="Email" type="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} required />
        <Input label="Password" type="password" value={form.password} onChange={v => setForm(p => ({ ...p, password: v }))} required />
        {error && <div className="form-error">{error}</div>}
        {unverified && (
          <div className="form-hint resend-block">
            Didn't receive the email?{" "}
            <button type="button" className="link-btn" onClick={resend} disabled={resendState === "sending"}>
              {resendState === "sending" ? "Sending..." : resendState === "sent" ? "Verification email sent" : "Resend verification email"}
            </button>
          </div>
        )}
        <button className="btn btn-primary full center" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
        <div className="auth-switch">
          Need an administrator account? <Link to="/register">Register</Link>
        </div>
      </form>
    </div>
  );
}
