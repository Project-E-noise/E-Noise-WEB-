import { useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "../components/common/FormFields";
import { AuthLayout } from "../components/common/AuthLayout";
import { clientApi } from "../services/client";
import { isValidEmail } from "../utils/validation";

// Step 1 of the client setup: name + email. The password is chosen later
// from the link in the email (that also proves the email is theirs).
export default function ClientRegister() {
  const [form, setForm] = useState({ full_name: "", email: "", contact: "" });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const update = field => value => setForm(previous => ({ ...previous, [field]: value }));

  const submit = async event => {
    event.preventDefault();
    const next = {};
    if (!form.full_name.trim()) next.full_name = "Enter your full name.";
    else if (form.full_name.trim().length > 100) next.full_name = "Name must be 100 characters or fewer.";
    if (!isValidEmail(form.email)) next.email = "Enter a valid email address.";
    if (form.contact.trim().length > 100) next.contact = "Contact must be 100 characters or fewer.";
    setErrors(next);
    setError("");
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await clientApi.register({ full_name: form.full_name.trim(), email: form.email.trim(), contact: form.contact.trim(), consent });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <AuthLayout subtitle="Client registration" icon="ti-mail" title="Check your email" intro="If this address can receive email, we sent a link to confirm it and choose your password.">
        <Link className="btn btn-primary btn-block" to="/client/login">Go to sign in</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Client registration" title="Create your account" intro="We'll email you a link to confirm your address and choose a password." onSubmit={submit}>
      <Input label="Full name" autoComplete="name" value={form.full_name} onChange={update("full_name")} error={errors.full_name} required />
      <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={update("email")} error={errors.email} required />
      <Input label="Contact number (optional)" type="tel" autoComplete="tel" value={form.contact} onChange={update("contact")} error={errors.contact} />
      <div className="consent-notice" id="consent-notice">
        <p>Studify uses Project E-Noise to measure noise levels at each table. By creating an account, I understand that:</p>
        <ul>
          <li>the sound level at my assigned table is measured every second;</li>
          <li>when my table is loud, a one-second sound clip may be analyzed to identify the type of sound, but it is never saved;</li>
          <li>three violations within 30 days result in a one-week ban;</li>
          <li>only Studify's administrator can see my name, email and violation records;</li>
          <li>violation records are deleted after 30 days.</li>
        </ul>
        <p>My data is handled in line with the Data Privacy Act of 2012 (RA 10173).</p>
      </div>
      <label className="consent-check">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required aria-describedby="consent-notice" />
        <span>I have read and agree to the notice above.</span>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={submitting || !consent}>{submitting ? "Sending setup link..." : "Continue"}</button>
      <div className="auth-switch">Already have an account? <Link to="/client/login">Sign in</Link></div>
    </AuthLayout>
  );
}
