import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./Login";
import ProtectedRoute from "./ProtectedRoute";
import UserPage from "./UserPage";
import DailyCostApp from "./DailyCostApp"; // adjust import path if needed

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <DailyCostApp />
            </ProtectedRoute>
          }
        />

        <Route
          path="/user"
          element={
            <ProtectedRoute>
              <UserPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
