/**
 * AdminSidebar — grouped sidebar navigation with badge counts,
 * active-page highlight, and keyboard shortcut overlay.
 */
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  path: string;
  label: string;
  icon: string;
  badge?: number;
  shortcut?: string;
}

interface NavGroup {
  group: string;
  icon: string;
  items: NavItem[];
}

// ── Navigation config ─────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Overview',
    icon: '📊',
    items: [
      { path: '/admin-dashboard', label: 'Dashboard', icon: '🏠', shortcut: 'G D' },
      { path: '/admin-analytics', label: 'Analytics', icon: '📈', shortcut: 'G A' },
      { path: '/analytics', label: 'Analytics (Legacy)', icon: '📉' },
    ],
  },
  {
    group: 'Places',
    icon: '📍',
    items: [
      { path: '/admin-places', label: 'Places', icon: '🗺', shortcut: 'G P' },
      { path: '/places', label: 'Place Management', icon: '✏️' },
      { path: '/osm-import', label: 'OSM Import', icon: '🌐' },
    ],
  },
  {
    group: 'Users',
    icon: '👥',
    items: [
      { path: '/admin-users', label: 'Users', icon: '👤', shortcut: 'G U' },
      { path: '/users', label: 'User Search', icon: '🔍' },
      { path: '/user-management', label: 'User Management', icon: '⚙️' },
      { path: '/provider-verification', label: 'Provider Verification', icon: '✅', badge: 12, shortcut: 'G V' },
    ],
  },
  {
    group: 'Content',
    icon: '📝',
    items: [
      { path: '/moderation', label: 'Moderation', icon: '🛡', badge: 5 },
      { path: '/mod-queue', label: 'Mod Queue', icon: '📋', badge: 18, shortcut: 'G M' },
      { path: '/reviews', label: 'Reviews', icon: '⭐' },
      { path: '/reported-posts', label: 'Reported Posts', icon: '🚩', badge: 7 },
      { path: '/reported-comments', label: 'Reported Comments', icon: '💬', badge: 3 },
    ],
  },
  {
    group: 'Operations',
    icon: '⚙️',
    items: [
      { path: '/incidents', label: 'Incidents', icon: '⚠️', badge: 4 },
      { path: '/safety', label: 'Safety', icon: '🛡️' },
      { path: '/push-notifications', label: 'Push Notifications', icon: '📱' },
      { path: '/events', label: 'Events', icon: '📅' },
      { path: '/messages', label: 'Messages', icon: '✉️' },
      { path: '/assistant-usage', label: 'Assistant Usage', icon: '🤖' },
    ],
  },
  {
    group: 'Gamification',
    icon: '🎮',
    items: [
      { path: '/admin-challenges', label: 'Challenges', icon: '🏆', shortcut: 'G C' },
      { path: '/verification', label: 'Verification', icon: '🏅' },
    ],
  },
  {
    group: 'Settings',
    icon: '🔧',
    items: [
      { path: '/admin-settings', label: 'Settings', icon: '⚙️', shortcut: 'G S' },
      { path: '/admin-system', label: 'System Health', icon: '💻' },
      { path: '/audit', label: 'Audit Log', icon: '📜' },
      { path: '/export', label: 'Export Data', icon: '⬇️' },
    ],
  },
];

// ── Keyboard shortcuts reference ──────────────────────────────────────────────

const SHORTCUTS = [
  { keys: 'G D', desc: 'Go to Dashboard' },
  { keys: 'G U', desc: 'Go to Users' },
  { keys: 'G P', desc: 'Go to Places' },
  { keys: 'G V', desc: 'Go to Verifications' },
  { keys: 'G M', desc: 'Go to Mod Queue' },
  { keys: 'G A', desc: 'Go to Analytics' },
  { keys: 'G C', desc: 'Go to Challenges' },
  { keys: 'G S', desc: 'Go to Settings' },
  { keys: '?', desc: 'Show / hide this overlay' },
  { keys: '⌘ K', desc: 'Command palette (coming soon)' },
];

// ── Shortcut overlay ──────────────────────────────────────────────────────────

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.6)',
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#1e1e2e',
          color: '#cdd6f4',
          borderRadius: 12,
          width: 420,
          boxShadow: '0 8px 40px rgba(0,0,0,.6)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>⌨ Keyboard Shortcuts</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>
          {SHORTCUTS.map((s) => (
            <div key={s.keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>{s.desc}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {s.keys.split(' ').map((k) => (
                  <kbd
                    key={k}
                    style={{
                      background: 'rgba(255,255,255,.12)',
                      border: '1px solid rgba(255,255,255,.2)',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: '#cba6f7',
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 20px', background: 'rgba(255,255,255,.05)', fontSize: 11, color: 'rgba(255,255,255,.4)', textAlign: 'center' }}>
          Press <kbd style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 3, padding: '1px 5px', fontSize: 11, fontFamily: 'monospace' }}>?</kbd> anywhere to toggle this overlay
        </div>
      </div>
    </div>
  );
}

// ── Sidebar Component ─────────────────────────────────────────────────────────

interface AdminSidebarProps {
  /** Badge override values from live data; keys are nav item paths */
  badges?: Partial<Record<string, number>>;
}

export function AdminSidebar({ badges = {} }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  function toggleGroup(group: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  const totalBadges = NAV_GROUPS.flatMap((g) => g.items).reduce((acc, item) => {
    const override = badges[item.path];
    return acc + (override ?? item.badge ?? 0);
  }, 0);

  const sidebarWidth = sidebarOpen ? 220 : 56;

  const linkBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: sidebarOpen ? '7px 12px 7px 16px' : '7px 0',
    justifyContent: sidebarOpen ? 'flex-start' : 'center',
    textDecoration: 'none',
    fontSize: 13,
    borderRadius: 6,
    margin: '1px 6px',
    color: '#555',
    transition: 'background 0.15s',
    cursor: 'pointer',
  };

  const activeLinkBase: React.CSSProperties = {
    ...linkBase,
    background: '#e3f2fd',
    color: '#1565c0',
    fontWeight: 700,
  };

  return (
    <>
      <aside
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          background: '#fff',
          borderRight: '1px solid #e0e0e0',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          transition: 'width 0.2s',
          overflow: 'hidden',
          position: 'sticky',
          top: 0,
        }}
      >
        {/* Header */}
        <div style={{
          padding: sidebarOpen ? '16px 14px 12px' : '16px 0 12px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarOpen ? 'space-between' : 'center',
          flexShrink: 0,
        }}>
          {sidebarOpen && (
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a237e', direction: 'rtl' }}>
              خرائط العراق
            </span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              color: '#888',
              fontSize: 16,
            }}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Pending summary (only when expanded) */}
        {sidebarOpen && totalBadges > 0 && (
          <div style={{
            margin: '10px 10px 4px',
            background: '#ffebee',
            border: '1px solid #ffcdd2',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 11,
            color: '#c62828',
            fontWeight: 600,
          }}>
            ⚠ {totalBadges} items need attention
          </div>
        )}

        {/* Nav groups */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {NAV_GROUPS.map((grp) => {
            const isCollapsed = collapsed.has(grp.group);
            const groupBadge = grp.items.reduce((acc, item) => acc + (badges[item.path] ?? item.badge ?? 0), 0);

            return (
              <div key={grp.group}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(grp.group)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: sidebarOpen ? '6px 14px 4px' : '6px 0 4px',
                    justifyContent: sidebarOpen ? 'flex-start' : 'center',
                    color: '#999',
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  <span>{grp.icon}</span>
                  {sidebarOpen && (
                    <>
                      <span style={{ flex: 1, textAlign: 'left' }}>{grp.group}</span>
                      {groupBadge > 0 && (
                        <span style={{
                          background: '#f44336',
                          color: '#fff',
                          borderRadius: 10,
                          fontSize: 9,
                          padding: '1px 5px',
                          fontWeight: 700,
                        }}>
                          {groupBadge}
                        </span>
                      )}
                      <span style={{ fontSize: 9, color: '#ccc' }}>{isCollapsed ? '▼' : '▲'}</span>
                    </>
                  )}
                </button>

                {/* Group items */}
                {!isCollapsed && grp.items.map((item) => {
                  const badge = badges[item.path] ?? item.badge;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      title={!sidebarOpen ? item.label : undefined}
                      style={({ isActive }) => ({
                        ...(isActive ? activeLinkBase : linkBase),
                      })}
                    >
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                      {sidebarOpen && (
                        <>
                          <span style={{ flex: 1 }}>{item.label}</span>
                          {badge !== undefined && badge > 0 && (
                            <span style={{
                              background: '#f44336',
                              color: '#fff',
                              borderRadius: 10,
                              fontSize: 10,
                              padding: '1px 6px',
                              fontWeight: 700,
                              marginLeft: 'auto',
                            }}>
                              {badge}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid #eee',
          padding: '10px 8px',
          display: 'flex',
          flexDirection: sidebarOpen ? 'row' : 'column',
          gap: 6,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <button
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts"
            style={{
              background: '#f5f5f5',
              border: '1px solid #e0e0e0',
              borderRadius: 6,
              cursor: 'pointer',
              padding: '5px 8px',
              fontSize: 12,
              color: '#555',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ⌨{sidebarOpen && ' Shortcuts'}
          </button>
        </div>
      </aside>

      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
    </>
  );
}

// ── SidebarLayout ─────────────────────────────────────────────────────────────
// Drop-in layout wrapper that adds the sidebar to any page.

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <AdminSidebar
        badges={{
          '/provider-verification': 12,
          '/mod-queue': 18,
          '/reported-posts': 7,
          '/reported-comments': 3,
          '/moderation': 5,
          '/incidents': 4,
        }}
      />
      <main style={{ flex: 1, padding: '24px 32px', minWidth: 0, background: '#fafafa' }}>
        {children}
      </main>
    </div>
  );
}
