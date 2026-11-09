import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { EmptyState } from "../components/common/UiStates";

export default function NotFound() {
  const { role } = useAuth();
  const home = role === "client" ? "/client/dashboard" : role === "admin" ? "/overview" : "/login";
  return (
    <main className="not-found">
      <EmptyState
        icon="ti-map-question"
        title="Page not found"
        subtitle="The link may be old or mistyped."
        action={<Link className="btn btn-primary" to={home}>Go to the home page</Link>}
      />
    </main>
  );
}
