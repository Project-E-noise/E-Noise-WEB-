import { useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "../components/common/FormFields";
import { AuthLayout } from "../components/common/AuthLayout";
import { authApi } from "../services/auth";
import { isValidEmail, passwordIssue } from "../utils/validation";

export default function Register() {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "", invite_code: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const update = field => value => setForm(prev => ({ ...prev, [field]: value }));

  const submit = async e => {
    e.preventDefault();
    const next = {};
    if (!form.full_name.trim()) next.full_name = "Enter your full name.";
    else if (form.full_name.trim().length > 100) next.full_name = "Name must be 100 characters or fewer.";
    if (!isValidEmail(form.email)) next.email = "Enter a valid email address.";
    const pwIssue = passwordIssue(form.password);
    if (pwIssue) next.password = pwIssue;
    if (form.password !== form.confirm) next.confirm = "Passwords do not match.";
    if (!form.invite_code.trim()) next.invite_code = "Enter the invite code from your administrator.";
    setErrors(next);
    setError(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await authApi.register({ full_name: form.full_name.trim(), email: form.email.trim(), password: form.password, invite_code: form.invite_code.trim() });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthLayout subtitle="Administrator registration" icon="ti-mail" title="Check your email" intro="Your account was created. Open the link in the verification email, then sign in.">
        <Link className="btn btn-primary btn-block" to="/login">Back to sign in</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Administrator registration" title="Create an administrator account" intro="You need an invite code from the system owner." onSubmit={submit}>
      <Input label="Full name" autoComplete="name" value={form.full_name} onChange={update("full_name")} error={errors.full_name} required />
      <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={update("email")} error={errors.email} required />
      <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={update("password")} hint="At least 8 characters." error={errors.password} required />
      <Input label="Confirm password" type="password" autoComplete="new-password" value={form.confirm} onChange={update("confirm")} error={errors.confirm} required />
      <Input label="Invite code" value={form.invite_code} onChange={update("invite_code")} error={errors.invite_code} autoComplete="off" required />
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={submitting}>{submitting ? "Creating account..." : "Create account"}</button>
      <div className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></div>
    </AuthLayout>
  );
}
