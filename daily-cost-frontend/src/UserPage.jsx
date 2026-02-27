import { useNavigate } from "react-router-dom";
import { getUser, logout } from "./auth";

export default function UserPage() {
  const user = getUser();
  const nav = useNavigate();

  return (
    <div className="container user-page">
      <h2>User</h2>
      <pre className="user-info">
        {JSON.stringify(
          {
            id: user?.id,
            name: user?.name,
            avatarUrl: user?.avatarUrl,
            bannerUrl: user?.bannerUrl,
          },
          null,
          2,
        )}
      </pre>

      <div className="button-row">
        <button onClick={() => nav("/app")}>Back to App</button>
        <button
          onClick={() => {
            logout();
            nav("/", { replace: true });
          }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
