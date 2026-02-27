import { useNavigate } from "react-router-dom";
import { getUser, logout } from "./auth";

export default function UserPage() {
  const user = getUser();
  const nav = useNavigate();

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <h2>User</h2>
      <pre
        style={{
          background: "#111",
          color: "#0f0",
          padding: 12,
          borderRadius: 8,
        }}
      >
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

      <div style={{ display: "flex", gap: 8 }}>
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
