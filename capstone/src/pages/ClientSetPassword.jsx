import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { clientApi } from "../services/client";
import { Input } from "../components/common/FormFields";
import { AuthLayout } from "../components/common/AuthLayout";
import { LoadingState } from "../components/common/UiStates";
import { isValidEmail, passwordIssue } from "../utils/validation";

// Step 2 of the client setup: the emailed link opens this page. Choosing a
// password confirms the email. The link works only once.
export default function ClientSetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const checked = useRef({ token: null, promise: null });
  const [state, setState] = useState("checking"); // checking | valid | invalid | expired | complete | error
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    if (!token) return setState("invalid");
    // Check the link once per token (React runs effects twice in development).
    if (checked.current.token !== token) checked.current = { token, promise: clientApi.checkVerification(token) };
    let active = true;
    checked.current.promise
      .then(() => active && setState("valid"))
      .catch(err => active && setState(err.status === 410 ? "expired" : err.status === 404 ? "invalid" : "error"));
    return () => { active = false; };
  }, [token]);

  const submit = async event => {
    event.preventDefault();
    const errors = {};
    const issue = passwordIssue(password);
    if (issue) errors.password = issue;
    if (password !== confirm) errors.confirm = "Passwords do not match.";
    setFieldErrors(errors);
    setError("");
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      await clientApi.setPassword(token, password);
      setState("complete");
    } catch (err) {
      if (err.status === 410) setState("expired");
      else if (err.status === 404) setState("invalid");
      else setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resend = async event => {
    event.preventDefault();
    if (!isValidEmail(email)) return setResendMessage("Enter a valid email address.");
    try {
      await clientApi.resendVerification(email.trim());
      setResendMessage("If that address has a pending setup, a new email has been sent.");
    } catch (err) {
      setResendMessage(err.message);
    }
  };

  if (state === "checking") return <AuthLayout subtitle="Account setup"><LoadingState label="Checking your setup link..." /></AuthLayout>;

  if (state === "complete") {
    return (
      <AuthLayout subtitle="Account setup" icon="ti-circle-check" title="Password set" intro="Your email is confirmed. You can now sign in.">
        <Link className="btn btn-primary btn-block" to="/client/login">Continue to sign in</Link>
      </AuthLayout>
    );
  }

  if (state !== "valid") {
    const title = state === "expired" ? "Setup link expired" : state === "error" ? "Couldn't check this link" : "Setup link is invalid";
    const intro = state === "error" ? "The server could not be reached. Please try again in a minute." : "Request a new setup email below.";
    return (
      <AuthLayout subtitle="Account setup" icon="ti-alert-triangle" title={title} intro={intro} onSubmit={resend}>
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} required />
        {resendMessage && <div className="alert alert-info" role="status">{resendMessage}</div>}
        <button className="btn btn-primary btn-block">Send a new setup email</button>
        <div className="auth-switch"><Link to="/client/login">Back to sign in</Link></div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Account setup" icon="ti-lock" title="Set your password" intro="This also confirms your email address." onSubmit={submit}>
      <Input label="New password" type="password" autoComplete="new-password" value={password} onChange={setPassword} hint="At least 8 characters." error={fieldErrors.password} required />
      <Input label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} error={fieldErrors.confirm} required />
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={saving}>{saving ? "Saving..." : "Confirm email and set password"}</button>
      <div className="auth-switch"><Link to="/client/login">Cancel</Link></div>
    </AuthLayout>
  );
}
