import { Navigate, Outlet, createBrowserRouter, useLocation } from "react-router-dom";
import App from "./App";
import Overview from "./pages/Overview";
import Feedback from "./pages/Feedback";
import Insights from "./pages/Insights";
import Issues from "./pages/Issues";
import IssueDetail from "./pages/IssueDetail";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import ErrorPage from "./pages/ErrorPage";
import { useAuth } from "./auth/AuthContext";

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <p className="text-sm text-muted py-10" role="status">
        Checking your session…
      </p>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      { path: "login", element: <Login /> },
      // Legal pages stay public: they make no API calls.
      { path: "privacy", element: <Privacy /> },
      { path: "terms", element: <Terms /> },
      {
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <Overview /> },
          { path: "feedback", element: <Feedback /> },
          { path: "insights", element: <Insights /> },
          { path: "issues", element: <Issues /> },
          { path: "issues/:id", element: <IssueDetail /> },
          { path: "reports", element: <Reports /> },
          { path: "settings", element: <Settings /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
