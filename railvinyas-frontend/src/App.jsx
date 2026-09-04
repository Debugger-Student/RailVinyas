// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout, ProtectedRoute } from "./components/ui";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import NewBlockRequest from "./pages/NewBlockRequest";
import SectionTraffic from "./pages/SectionTraffic";
import Reports from "./pages/Reports";
import AdminPanel from "./pages/AdminPanel";

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Register />} />

      <Route path="/dashboard" element={
        <ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>
      } />
      <Route path="/new-request" element={
        <ProtectedRoute roles={["Admin", "Section Controller"]}><Layout><NewBlockRequest /></Layout></ProtectedRoute>
      } />
      <Route path="/section-traffic" element={
        <ProtectedRoute><Layout><SectionTraffic /></Layout></ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute roles={["Admin", "Section Controller"]}><Layout><Reports /></Layout></ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute roles={["Admin"]}><Layout><AdminPanel /></Layout></ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
