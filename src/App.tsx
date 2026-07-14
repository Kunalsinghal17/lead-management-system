import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PermissionAction, useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import CentralPool from "./pages/CentralPool";
import BulkUpload from "./pages/BulkUpload";
import Visitors from "./pages/Visitors";
import UsersRoles from "./pages/UsersRoles";
import AskAI from "./pages/AskAI";

/** Route ↔ page-permission map. Order defines the fallback landing page. */
export const PAGES: { path: string; perm: PermissionAction; element: React.ReactNode }[] = [
  { path: "/dashboard", perm: "pageDashboard", element: <Dashboard /> },
  { path: "/ask-ai", perm: "pageAskAI", element: <AskAI /> },
  { path: "/leads", perm: "pageLeads", element: <Leads /> },
  { path: "/central-pool", perm: "pageCentralPool", element: <CentralPool /> },
  { path: "/bulk-upload", perm: "pageBulkUpload", element: <BulkUpload /> },
  { path: "/visitor-analytics", perm: "pageVisitorAnalytics", element: <Visitors /> },
  { path: "/users-roles", perm: "pageUsersRoles", element: <UsersRoles /> }
];

export default function App() {
  const { user, can } = useAuth();

  // / security controls: nothing renders without login.
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // First page this role is allowed to open (page-level access rights)
  const home = PAGES.find(p => can(p.perm))?.path ?? "/dashboard";

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        {PAGES.map(p => (
          <Route
            key={p.path}
            path={p.path}
            element={can(p.perm) ? p.element : <Navigate to={home} replace />}
          />
        ))}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}
