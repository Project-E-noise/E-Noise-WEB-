export function ProfileHeader({ name, email, role }) {
  const initials = (name || email || role || "U").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <div className="profile-heading">
    <div className="admin-av lg" aria-hidden="true">{initials}</div>
    <div className="profile-heading-copy"><h2>{name || "Account profile"}</h2><div className="mono-muted">{email}</div></div>
    <span className="role-badge">{role}</span>
  </div>;
}
