import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Input } from "../components/common/FormFields";
import { clientApi } from "../services/client";

export function ClientVerify() {
  const location = useLocation();
  return <Navigate to={`/client/set-password${location.search}`} replace />;
}

export function ClientLogin() {
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
    setSubmitting(true);
    setError("");
    setShowSetupHelp(false);
    const result = await clientLogin(form.email, form.password);
    setSubmitting(false);
    if (result.ok) {
      const requested = location.state?.from?.pathname;
      navigate(requested?.startsWith("/client/") ? requested : "/client/dashboard", { replace: true });
      return;
    }
    setError(result.message);
    setShowSetupHelp(true);
  };

  const resend = async () => {
    setResendState("sending");
    try {
      await clientApi.resendVerification(form.email);
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  };

  return <div className="auth-shell client-auth">
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-brand">
        <div className="sb-logo"><i className="ti ti-wave-sine" /></div>
        <div><div className="sb-name">E-Noise</div><div className="sb-sub">Client sign in</div></div>
      </div>
      <Input label="Email" type="email" value={form.email} onChange={email => setForm(previous => ({ ...previous, email }))} required />
      <Input label="Password" type="password" value={form.password} onChange={password => setForm(previous => ({ ...previous, password }))} required />
      {error && <div className="form-error">{error}</div>}
      {showSetupHelp && <div className="client-setup-help">
        <p>If you don't have a password yet, finish setup from the email we sent you.</p>
        <button type="button" className="link-btn" onClick={resend} disabled={!form.email || resendState === "sending"}>
          {resendState === "sending" ? "Sending…" : resendState === "sent" ? "If setup is pending, a new email has been sent" : resendState === "error" ? "Try resend again" : "Resend setup email"}
        </button>
      </div>}
      <button className="btn btn-primary full center" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
      <div className="auth-switch">New client? <Link to="/client/register">Create account</Link></div>
    </form>
  </div>;
}

export function ClientRegister() {
  const { clientRegister } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", contact: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const update = field => value => setForm(previous => ({ ...previous, [field]: value }));

  const submit = async event => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await clientRegister({
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      contact: form.contact.trim()
    });
    setSubmitting(false);
    if (result.ok) {
      setInfo("Check your email to finish setting up your account.");
      setDone(true);
    } else {
      setError(result.message);
    }
  };

  return <div className="auth-shell client-auth">
    <form className="auth-card" onSubmit={submit}>
      <h2>{done ? "Check your email" : "Client registration"}</h2>
      {done ? <>
        <p className="client-success-message">{info}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate("/client/login")}>Go to sign in</button>
      </> : <>
        <Input label="Full name" value={form.full_name} onChange={update("full_name")} required />
        <Input label="Email" type="email" value={form.email} onChange={update("email")} required />
        <Input label="Contact (optional)" value={form.contact} onChange={update("contact")} />
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary full" disabled={submitting}>{submitting ? "Sending setup link…" : "Continue"}</button>
        <div className="auth-switch"><Link to="/client/login">Sign in</Link></div>
      </>}
    </form>
  </div>;
}
