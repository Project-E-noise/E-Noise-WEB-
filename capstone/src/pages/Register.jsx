import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Input } from "../components/common/FormFields";
import { isValidEmail, passwordIssue } from "../utils/validation";

export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const submit = async e => {
    e.preventDefault();
    if (!form.full_name.trim()) return setError("Enter your full name.");
    if (!isValidEmail(form.email)) return setError("Enter a valid email address.");
    const pwIssue = passwordIssue(form.password);
    if (pwIssue) return setError(pwIssue);
    if (form.password !== form.confirm) return setError("Passwords do not match.");

    setSubmitting(true);
    setError(null);
    const result = await register({ full_name: form.full_name, email: form.email, password: form.password });
    setSubmitting(false);
    if (result.ok) setDone(true);
    else setError(result.message);
  };

  if (done) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="sb-logo">
              <i className="ti ti-circle-check" />
            </div>
            <div>
              <div className="sb-name">Account created successfully</div>
              <div className="sb-sub">Please check your email and verify your account before logging in.</div>
            </div>
          </div>
          <Link className="btn btn-primary full center" to="/login">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="sb-logo">
            <i className="ti ti-wave-sine" />
          </div>
          <div>
            <div className="sb-name">E-Noise</div>
            <div className="sb-sub">Administrator registration</div>
          </div>
        </div>
        <Input label="Full name" value={form.full_name} onChange={v => update("full_name", v)} required />
        <Input label="Email" type="email" value={form.email} onChange={v => update("email", v)} required />
        <Input label="Password" type="password" value={form.password} onChange={v => update("password", v)} hint="At least 8 characters." required />
        <Input label="Confirm password" type="password" value={form.confirm} onChange={v => update("confirm", v)} required />
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary full center" disabled={submitting}>
          {submitting ? "Creating account..." : "Create administrator account"}
        </button>
        <div className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
