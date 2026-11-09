import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../services/apiClient";
import { clientApi } from "../services/client";
import { Input } from "../components/common/FormFields";
import { LoadingState } from "../components/common/UiStates";

export default function ClientSetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const verificationRequest = useRef({ token: null, promise: null });
  const [state, setState] = useState("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (verificationRequest.current.token !== token) {
      verificationRequest.current = { token, promise: clientApi.checkVerification(token) };
    }
    let active = true;
    setState("checking");
    verificationRequest.current.promise
      .then(result => { if (active) setState(result.valid ? "valid" : "invalid"); })
      .catch(err => {
        if (!active) return;
        setState(err instanceof ApiError && err.status === 410 ? "expired" : "invalid");
      });
    return () => { active = false; };
  }, [token]);

  const submit = async event => {
    event.preventDefault();
    const errors = {};
    if (password.length < 8) errors.password = "Password must be at least 8 characters.";
    else if (new TextEncoder().encode(password).length > 72) errors.password = "Password must be 72 UTF-8 bytes or fewer.";
    if (password !== confirm) errors.confirm = "Passwords do not match.";
    setFieldErrors(errors);
    setError("");
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      await clientApi.setPassword(token, password);
      setState("complete");
    } catch (err) {
      setError(err.message);
      if (err instanceof ApiError && err.status === 410) setState("expired");
      else if (err instanceof ApiError && err.status === 404) setState("invalid");
    } finally {
      setSaving(false);
    }
  };

  const resend = async event => {
    event.preventDefault();
    setResendMessage("");
    try {
      await clientApi.resendVerification(email.trim());
      setResendMessage("If that address has a pending setup, a new email has been sent.");
    } catch (err) {
      setResendMessage(err.message);
    }
  };

  if (state === "checking") return <div className="auth-shell client-auth"><div className="auth-card"><LoadingState label="Checking your setup link…" /></div></div>;
  if (state === "complete") return <div className="auth-shell client-auth"><div className="auth-card">
    <div className="client-success-message"><h2>Password set</h2><p>Your email is confirmed. You can now sign in.</p></div>
    <Link className="btn btn-primary full center" to="/client/login">Continue to sign in</Link>
  </div></div>;
  if (state === "invalid" || state === "expired") return <div className="auth-shell client-auth"><div className="auth-card">
    <div className="client-link-error"><h2>{state === "expired" ? "Setup link expired" : "Setup link is invalid"}</h2><p>{error || (state === "expired" ? "Request a new setup email to continue." : "Request a new setup email or contact the hub administrator.")}</p></div>
    <form className="client-resend-form" onSubmit={resend}>
      <Input label="Email" type="email" value={email} onChange={setEmail} required />
      <button className="btn btn-primary full">Request a new setup email</button>
      {resendMessage && <p className="client-resend-message">{resendMessage}</p>}
    </form>
    <div className="auth-switch"><Link to="/client/login">Back to sign in</Link></div>
  </div></div>;

  return <div className="auth-shell client-auth"><form className="auth-card" onSubmit={submit} noValidate>
    <div className="auth-brand"><div className="sb-logo"><i className="ti ti-lock" /></div><div><div className="sb-name">Set your password</div><div className="sb-sub">This confirms your email address.</div></div></div>
    <Input label="New password" type="password" value={password} onChange={setPassword} hint="At least 8 characters." required />
    {fieldErrors.password && <div className="field-error client-inline-error">{fieldErrors.password}</div>}
    <Input label="Confirm password" type="password" value={confirm} onChange={setConfirm} required />
    {fieldErrors.confirm && <div className="field-error client-inline-error">{fieldErrors.confirm}</div>}
    {error && <div className="form-error">{error}</div>}
    <button className="btn btn-primary full" disabled={saving}>{saving ? "Setting password…" : "Confirm email and set password"}</button>
    <div className="auth-switch"><Link to="/client/login">Cancel and sign in</Link></div>
  </form></div>;
}
