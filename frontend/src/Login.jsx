import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "./api";
import { setUser } from "./auth";

export default function LoginPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = mode === "login"
        ? await login(name, password)
        : await register(name, password, inviteCode);
      setUser(user);
      nav("/app");
    } catch (requestError) {
      setError(requestError.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-scene">
        <div className="login-sun" />
        <div className="login-city">旅</div>
        <div className="login-scene-copy">
          <span>TRIP PLANNER · 旅の計画</span>
          <h2>Every great journey<br />starts with a plan.</h2>
          <p>Pack together. Plan every day. Make memories.</p>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-brand"><span>タビ</span><small>TRIP TOOLS</small></div>
        <h1>{mode === "login" ? "Welcome back" : "Join the journey"}</h1>
        <p className="login-intro">{mode === "login" ? "Your next adventure is waiting." : "Use the invitation from your travel companion."}</p>

        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Log in</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Join a trip</button>
        </div>

        <form onSubmit={submit} className="login-form">
          <label>TRAVELER NAME<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="username" placeholder="Username" required /></label>
          <label>PASSWORD<input value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Enter your password" type="password" required />{mode === "register" && <small>At least 6 characters with a letter and a number.</small>}</label>
          {mode === "register" && <label>INVITATION CODE<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="8-character code" maxLength={32} required /></label>}
          {error && <div className="login-error">{error}</div>}
          <button className="login-submit" disabled={loading}>{loading ? "Opening your trip…" : mode === "login" ? "Enter Trip Tools  →" : "Join shared trip  →"}</button>
        </form>
        <p className="login-secure">Protected account · Private shared trip</p>
      </section>
    </main>
  );
}
