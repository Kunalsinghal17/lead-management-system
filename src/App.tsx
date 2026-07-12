import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import CentralPool from "./pages/CentralPool";
import BulkUpload from "./pages/BulkUpload";
import Visitors from "./pages/Visitors";
import UsersRoles from "./pages/UsersRoles";
import AskAI from "./pages/AskAI";

export default function App() {
  const { user } = useAuth();

  // BRDID01 / security controls: nothing renders without login.
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/ask-ai" element={<AskAI />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/central-pool" element={<CentralPool />} />
        <Route path="/bulk-upload" element={<BulkUpload />} />
        <Route path="/visitor-analytics" element={<Visitors />} />
        <Route
          path="/users-roles"
          element={user.role === "Admin" ? <UsersRoles /> : <Navigate to="/dashboard" replace />}
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}
