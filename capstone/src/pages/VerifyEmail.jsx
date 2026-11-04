import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../services/auth";
import { ApiError } from "../services/apiClient";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState("loading"); // loading | success | invalid | expired

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setState("success"))
      .catch(err => {
        if (err instanceof ApiError && err.status === 410) setState("expired");
        else setState("invalid");
      });
  }, [token]);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="sb-logo">
            <i className={`ti ${state === "success" ? "ti-circle-check" : state === "loading" ? "ti-loader-2 spin" : "ti-alert-triangle"}`} />
          </div>
          <div>
            <div className="sb-name">
              {state === "loading" && "Verifying your email..."}
              {state === "success" && "Email verified successfully."}
              {state === "invalid" && "This verification link is invalid."}
              {state === "expired" && "This verification link has expired."}
            </div>
            {state === "success" && <div className="sb-sub">You may now log in.</div>}
          </div>
        </div>
        {state !== "loading" && (
          <Link className="btn btn-primary full center" to="/login">
            Back to sign in
          </Link>
        )}
      </div>
    </div>
  );
}
