import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogIn, Play } from "lucide-react";
import { Button, Card, PageHeader, inputClass, labelClass } from "../components/ui";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login, loginDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const next = new URLSearchParams(location.search).get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const tryDemo = async () => {
    setDemoBusy(true);
    setError(null);
    try {
      await loginDemo();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo access failed. Try again.");
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Workspace access"
        title="Log in"
        description="Sign in to your InsightFlow workspace account. Sessions are managed by the server and expire automatically."
      />
      <Card className="max-w-md">
        <form onSubmit={submit} className="px-5 py-5 space-y-3.5">
          <div>
            <label className={labelClass} htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              className={inputClass}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button type="submit" variant="solid" disabled={busy || demoBusy} className="w-full">
            <LogIn size={15} /> {busy ? "Signing in…" : "Log in"}
          </Button>
          <div className="flex items-center gap-3 text-xs text-faint" aria-hidden>
            <span className="flex-1 border-t border-line" />
            <span>or</span>
            <span className="flex-1 border-t border-line" />
          </div>
          <Button type="button" variant="outline" disabled={busy || demoBusy} onClick={tryDemo} className="w-full">
            <Play size={15} /> {demoBusy ? "Starting demo…" : "Try Live Demo"}
          </Button>
          <p className="text-xs text-faint leading-relaxed">
            The demo signs you into a shared read-only account — no email needed. You can explore
            the dashboard, feedback, insights, issues, and reports, but changes are disabled.
          </p>
          <p className="text-xs text-faint leading-relaxed">
            No account yet? Ask your workspace administrator to create one. There is no public
            self-registration. <Link className="underline underline-offset-4" to="/privacy">Privacy Policy</Link>
          </p>
        </form>
      </Card>
    </>
  );
}
