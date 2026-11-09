// Centered card used by every sign-in / registration / email-link page.
export function AuthLayout({ subtitle, icon = "ti-wave-sine", title, intro, children, onSubmit }) {
  const content = (
    <>
      <div className="auth-brand">
        <div className="sb-logo"><i className={`ti ${icon}`} aria-hidden="true" /></div>
        <div>
          <div className="sb-name">E-Noise</div>
          {subtitle && <div className="sb-sub">{subtitle}</div>}
        </div>
      </div>
      {title && <h1 className="auth-title">{title}</h1>}
      {intro && <p className="auth-intro">{intro}</p>}
      {children}
    </>
  );
  return (
    <main className="auth-shell">
      {onSubmit
        ? <form className="auth-card" onSubmit={onSubmit} noValidate>{content}</form>
        : <div className="auth-card">{content}</div>}
    </main>
  );
}
