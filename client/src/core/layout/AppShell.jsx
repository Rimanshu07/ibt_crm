import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api, qs, ago, fmtDate } from '../api.js';
import { Loading } from '../ui.jsx';
import { accountingMenu, bookingsMenu, profileMenu, servicesMenu, suppliersMenu, ADMIN_MENU } from './nav.js';

/** Dropdown in the top bar; closes on outside click and on navigation. */
function NavMenu({ label, items, right, cols, active, badge, render }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname, loc.search]);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="nav-item" ref={ref}>
      <button className={`nav-btn ${active ? 'active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}{badge}{!render && <span className="small">▾</span>}
      </button>
      {open && (
        <div className={`menu ${right ? 'right' : ''} ${cols ? 'cols' : ''}`}>
          {render ? render(() => setOpen(false)) : items.map((i, k) => (i.divider ? <hr key={k} /> : i.title ? <div key={k} className="menu-title">{i.title}</div>
            : <Link key={i.to} to={i.to}><span>{i.icon ? `${i.icon} ` : ''}{i.label}</span>{i.count ? <span className="count">{i.count}</span> : null}</Link>))}
        </div>
      )}
    </div>
  );
}

function TripSearch() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const nav = useNavigate();
  useEffect(() => {
    if (q.trim().length < 2) { setRows(null); return undefined; }
    const t = setTimeout(() => api(`/trips${qs({ q, size: 8 })}`).then((r) => setRows(r.data)).catch(() => setRows([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="nav-search">
      <span className="ico">⌕</span>
      <input placeholder="Search for trips… (guest, phone, trip no.)" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) { nav(`/app/trips${qs({ q })}`); setRows(null); } if (e.key === 'Escape') setQ(''); }}
        onBlur={() => setTimeout(() => setRows(null), 200)} />
      {rows && (
        <div className="results">
          {rows.length === 0 && <div className="empty small">No trips found</div>}
          {rows.map((t) => (
            <Link key={t.id} to={`/app/trips/${t.id}`} onClick={() => setQ('')}>
              <strong>#{t.trip_no}</strong> · {t.guest_name} <span className="muted small">{t.guest_phone} · {t.destinations || t.services.join(', ')} · {fmtDate(t.start_date)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Bell() {
  const { me, setUnread } = useAuth();
  const [items, setItems] = useState([]);
  const load = () => api('/notifications?unread=1').then((r) => { setItems(r.data.slice(0, 8)); setUnread(r.unread); }).catch(() => {});
  useEffect(() => { const t = setInterval(() => api('/notifications/count').then((r) => setUnread(r.data.unread)).catch(() => {}), 60000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const readAll = async () => { await api('/notifications/read-all', { method: 'POST' }); setItems([]); setUnread(0); };
  return (
    <NavMenu right label={<span className="bell" onClick={load}>🔔{me.unread > 0 && <span className="dot">{me.unread > 99 ? '99+' : me.unread}</span>}</span>}
      render={(close) => (
        <div style={{ width: 340 }}>
          <div className="row-between" style={{ padding: '6px 10px' }}><strong>Notifications</strong>{items.length > 0 && <button className="btn link small" onClick={readAll}>Mark all read</button>}</div>
          <hr />
          {items.length === 0 && <div className="empty small">You are all caught up.</div>}
          {items.map((n) => (
            <Link key={n.id} to={n.link || '/app/notifications'} onClick={() => { api(`/notifications/${n.id}/read`, { method: 'POST' }); close(); }}>
              <span><strong className="small">{n.title}</strong><br /><span className="muted small">{n.body} · {ago(n.created_at)}</span></span>
            </Link>
          ))}
          <hr /><Link to="/app/notifications" onClick={close}>See all notifications</Link>
        </div>
      )} />
  );
}

/** Organisation app: Sembark-style top navigation. */
export function AppShell() {
  const { me, loading, hasFeature, can, logout } = useAuth();
  const [counts, setCounts] = useState({});
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => { if (me?.org) api('/bookings/summary').then((r) => setCounts(r.data)).catch(() => {}); }, [me?.org, loc.pathname]);
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.role === 'super_admin') return <Navigate to="/admin" replace />;
  const allow = (i) => i.divider || i.title ? true : hasFeature(i.feature) && can(i.perm);
  const clean = (items) => items.filter(allow).filter((i, k, arr) => !(i.title && (!arr[k + 1] || arr[k + 1].title)));
  const is = (p) => loc.pathname.startsWith(p);
  const bookings = clean(bookingsMenu()).map((i) => ({ ...i, count: i.service ? counts[i.service]?.open : undefined }));
  const open = Object.values(counts).reduce((s, c) => s + (c.open || 0), 0);
  return (
    <>
      <header className="topnav">
        <Link to="/app" className="logo"><span className="logo-mark">IBT</span><span>{me.org.name}</span></Link>
        {hasFeature('crm_leads') && can('trips.view') && <NavLink to="/app/trips" className={`nav-btn ${is('/app/trips') ? 'active' : ''}`}>Trips</NavLink>}
        <NavMenu label="Bookings" items={bookings} active={is('/app/bookings') || is('/app/operations') || is('/app/tasks')} badge={open ? <span className="count">{open}</span> : null} />
        {hasFeature('accounting') && can('payments.log', 'accounts.view') && <NavMenu label="Accounting" items={clean(accountingMenu())} active={is('/app/accounting')} />}
        <TripSearch />
        <NavMenu label="Services" items={clean(servicesMenu())} right cols active={is('/app/services')} />
        <NavMenu label="Suppliers" items={clean(suppliersMenu())} right active={is('/app/suppliers')} />
        <Bell />
        <NavLink to="/app" end className="nav-btn" title="Dashboard">⌂</NavLink>
        <NavMenu right label={<span title={me.user.name}>👤</span>} render={() => (
          <>
            <div style={{ padding: '6px 10px' }}><strong>{me.user.name}</strong><div className="muted small">{me.user.email}</div><div className="muted small">{me.roles?.map((r) => r.name).join(', ') || (me.user.is_org_owner ? 'Owner' : '')}</div></div>
            <hr />
            {clean(profileMenu()).map((i, k) => (i.divider ? <hr key={k} /> : <Link key={i.to} to={i.to}>{i.label}</Link>))}
            <hr />
            <button onClick={() => { logout(); nav('/login'); }}>Log out</button>
          </>
        )} />
      </header>
      <main className="content"><Outlet /></main>
      <footer className="footer">© IBT Travels CRM · {me.org.name} · {me.org.base_currency} · {me.org.timezone}{me.org.trial_ends_at ? ` · Trial until ${fmtDate(me.org.trial_ends_at)}` : ''}</footer>
    </>
  );
}

/** Super Admin panel: sidebar layout. */
export function AdminShell() {
  const { me, loading, logout } = useAuth();
  const nav = useNavigate();
  if (loading) return <Loading />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.role !== 'super_admin') return <Navigate to="/app" replace />;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="logo-mark">IBT</span>IBT Travels CRM</div>
        <div className="nav-section">Super Admin</div>
        {ADMIN_MENU.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className="nav-link">{i.label}</NavLink>)}
      </aside>
      <div className="main">
        <header className="topbar"><span className="muted small">Platform administration</span>
          <div className="row"><span className="small">{me.user.name}</span><button className="btn secondary small" onClick={() => { logout(); nav('/login'); }}>Log out</button></div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}

/** Guards a route by feature and permission. */
export function Guard({ feature, perm, children }) {
  const { hasFeature, can } = useAuth();
  if (!hasFeature(feature)) return <div className="page"><div className="card"><div className="empty">This feature is not enabled for your organisation. Contact IBT Travels support to enable it.</div></div></div>;
  if (!can(...[].concat(perm || []))) return <div className="page"><div className="card"><div className="empty">You do not have permission to open this page. Ask your admin.</div></div></div>;
  return children;
}
