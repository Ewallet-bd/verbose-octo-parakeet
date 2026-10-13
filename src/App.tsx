import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './store/auth';
import { ThemeProvider } from './store/theme';
import { SoundProvider } from './store/sound';
import SoundAlertBanner from './components/SoundAlertBanner';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import NewOrder from './pages/NewOrder';
import RoutingRules from './pages/RoutingRules';
import GroupReports from './pages/GroupReports';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Automation from './pages/Automation';
import Login from './pages/Login';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SoundProvider>
          <BrowserRouter>
            <SoundAlertBanner />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="new-order" element={<NewOrder />} />
                <Route path="routing" element={<RoutingRules />} />
                <Route path="reports" element={<GroupReports />} />
                <Route path="automation" element={<Automation />} />
                <Route path="users" element={<Users />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </SoundProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
