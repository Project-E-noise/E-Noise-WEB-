import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Input } from "../components/common/FormFields";
import { AuthLayout } from "../components/common/AuthLayout";
import { clientApi } from "../services/client";
import { isValidEmail } from "../utils/validation";

export default function ClientLogin() {
  const { clientLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [showSetupHelp, setShowSetupHelp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resendState, setResendState] = useState("idle");

  const submit = async event => {
    event.preventDefault();
    if (!isValidEmail(form.email) || !form.password) return setError("Enter your email and password.");
    setSubmitting(true);
    setError("");
    setShowSetupHelp(false);
    const result = await clientLogin(form.email.trim(), form.password);
    setSubmitting(false);
    if (result.ok) {
      const requested = location.state?.from?.pathname;
      return navigate(requested?.startsWith("/client/") ? requested : "/client/dashboard", { replace: true });
    }
    setError(result.message);
    setShowSetupHelp(true);
  };

  const resend = async () => {
    setResendState("sending");
    try {
      await clientApi.resendVerification(form.email.trim());
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  };

  return (
    <AuthLayout subtitle="Client sign in" title="Sign in to your account" onSubmit={submit}>
      <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={email => setForm(p => ({ ...p, email }))} required />
      <Input label="Password" type="password" autoComplete="current-password" value={form.password} onChange={password => setForm(p => ({ ...p, password }))} required />
      {error && <div className="form-error" role="alert">{error}</div>}
      {showSetupHelp && (
        <div className="alert alert-info">
          No password yet? Finish setup from the email we sent you.{" "}
          <button type="button" className="link-btn" onClick={resend} disabled={!isValidEmail(form.email) || resendState === "sending" || resendState === "sent"}>
            {resendState === "sending" ? "Sending..." : resendState === "sent" ? "Email sent if setup is pending" : resendState === "error" ? "Try again" : "Resend setup email"}
          </button>
        </div>
      )}
      <button className="btn btn-primary btn-block" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</button>
      <div className="auth-switch">
        New here? <Link to="/client/register">Create an account</Link>
        <br />
        Administrator? <Link to="/login">Admin sign in</Link>
      </div>
    </AuthLayout>
  );
}
