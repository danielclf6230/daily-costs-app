import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "./api";
import { setUser } from "./auth";

export default function LoginPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const user = await login(name, password);
      setUser(user);
      nav("/app");
    } catch (e) {
      setErr(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container login-page">
      <h1>Daily Cost App</h1>

      <form onSubmit={onSubmit} className="login-form">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
        />
        <button disabled={loading || !name || !password}>
          {loading ? "Logging in..." : "Login"}
        </button>
        {err && <div className="error">{err}</div>}
      </form>
    </div>
  );
}
