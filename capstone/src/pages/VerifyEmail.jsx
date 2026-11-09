import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../services/auth";
import { AuthLayout } from "../components/common/AuthLayout";

const MESSAGES = {
  loading: ["ti-loader-2 spin", "Verifying your email...", ""],
  success: ["ti-circle-check", "Email verified", "You can now sign in."],
  invalid: ["ti-alert-triangle", "This verification link is invalid", "It may have been used already. Try signing in, or ask for a new link from the sign-in page."],
  expired: ["ti-alert-triangle", "This verification link has expired", "Sign in and use \"Resend verification email\" to get a new link."],
  error: ["ti-wifi-off", "Couldn't reach the server", "Please try again in a minute."]
};

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState(token ? "loading" : "invalid");
  const started = useRef(null);

  useEffect(() => {
    // The link can only be used once, so make sure it is sent once (React
    // runs effects twice in development).
    if (!token || started.current === token) return;
    started.current = token;
    authApi
      .verifyEmail(token)
      .then(() => setState("success"))
      .catch(err => setState(err.status === 410 ? "expired" : err.status === 404 || err.status === 400 ? "invalid" : "error"));
  }, [token]);

  const [icon, title, intro] = MESSAGES[state];
  return (
    <AuthLayout subtitle="Email verification" icon={icon} title={title} intro={intro}>
      {state !== "loading" && <Link className="btn btn-primary btn-block" to="/login">Go to sign in</Link>}
    </AuthLayout>
  );
}
