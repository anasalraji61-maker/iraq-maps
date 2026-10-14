import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { api } from './api';
import { LoginPage } from './pages/LoginPage';
import { VerificationPage } from './pages/VerificationPage';
import { AuditPage } from './pages/AuditPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReportedPostsPage } from './pages/ReportedPostsPage';
import { AssistantUsagePage } from './pages/AssistantUsagePage';

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  background: '#1565c0',
  padding: '0 24px',
};

const linkStyle: React.CSSProperties = {
  padding: '14px 20px',
  color: 'rgba(255,255,255,.75)',
  textDecoration: 'none',
  fontSize: 15,
};

const activeLinkStyle: React.CSSProperties = {
  ...linkStyle,
  color: '#fff',
  borderBottom: '3px solid #fff',
};

function NavBar() {
  const nav = useNavigate();
  function logout() {
    api.logout();
    nav('/login');
  }

  return (
    <nav style={navStyle}>
      <span style={{ padding: '14px 0', color: '#fff', fontWeight: 700, fontSize: 16, marginInlineEnd: 24 }}>
        خرائط العراق — الإدارة
      </span>
      <NavLink to="/dashboard" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
        الرئيسية
      </NavLink>
      <NavLink to="/verification" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
        التوثيق
      </NavLink>
      <NavLink to="/reported-posts" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
        المنشورات المُبلَّغ عنها
      </NavLink>
      <NavLink to="/audit" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
        السجل
      </NavLink>
      <NavLink to="/assistant-usage" style={({ isActive }) => isActive ? activeLinkStyle : linkStyle}>
        استخدام المساعد
      </NavLink>
      <button
        onClick={logout}
        style={{ marginInlineStart: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,.75)', cursor: 'pointer', fontSize: 14 }}
      >
        تسجيل الخروج
      </button>
    </nav>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  if (!api.isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
        {children}
      </main>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', direction: 'rtl', minHeight: '100vh', background: '#fafafa' }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <AuthGate>
                <Layout><DashboardPage /></Layout>
              </AuthGate>
            }
          />
          <Route
            path="/verification"
            element={
              <AuthGate>
                <Layout><VerificationPage /></Layout>
              </AuthGate>
            }
          />
          <Route
            path="/reported-posts"
            element={
              <AuthGate>
                <Layout><ReportedPostsPage /></Layout>
              </AuthGate>
            }
          />
          <Route
            path="/audit"
            element={
              <AuthGate>
                <Layout><AuditPage /></Layout>
              </AuthGate>
            }
          />
          <Route
            path="/assistant-usage"
            element={
              <AuthGate>
                <Layout><AssistantUsagePage /></Layout>
              </AuthGate>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
