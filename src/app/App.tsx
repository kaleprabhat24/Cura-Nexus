import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import {
  Activity, BedDouble, Bot, Calculator, CalendarDays, FileJson, FileText, Gauge, HeartPulse, LayoutDashboard, LogOut,
  Moon, Pill, Plug, Receipt, Settings as SettingsIcon, Shield, Sun, Target, Users,
} from 'lucide-react';
import type { Role } from '@/store';
import { logout, useSession } from './auth';
import { Landing, Login, Signup, ProblemStatement } from '@/pages/Public';
import { Dashboard } from '@/pages/Dashboard';
import { PatientForm, PatientList, PatientRecord } from '@/pages/Patients';
import { FhirViewer } from '@/pages/Fhir';
import { Modules } from '@/pages/Modules';
import { Calculators, Discharge, Interactions, RiskChecks } from '@/pages/Clinical';
import { Appointments, Beds, Billing, Icu } from '@/pages/Ops';
import { Admin, Chat, Settings } from '@/pages/System';

const STAFF: Role[] = ['doctor', 'nurse', 'admin'];
const ALL: Role[] = ['doctor', 'nurse', 'admin', 'patient'];

export const NAV: { to: string; label: string; icon: typeof Users; roles: Role[] }[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, roles: ALL },
  { to: '/app/patients', label: 'Patients', icon: Users, roles: STAFF },
  { to: '/app/fhir', label: 'FHIR Viewer', icon: FileJson, roles: STAFF },
  { to: '/app/modules', label: 'Connected Modules', icon: Plug, roles: STAFF },
  { to: '/app/risk', label: 'Risk checks', icon: Target, roles: ALL },
  { to: '/app/calculators', label: 'Calculators', icon: Calculator, roles: ALL },
  { to: '/app/chat', label: 'Clinical chat', icon: Bot, roles: ALL },
  { to: '/app/icu', label: 'ICU monitor', icon: HeartPulse, roles: STAFF },
  { to: '/app/beds', label: 'Bed board', icon: BedDouble, roles: STAFF },
  { to: '/app/appointments', label: 'Appointments', icon: CalendarDays, roles: ALL },
  { to: '/app/billing', label: 'Billing', icon: Receipt, roles: ['admin', 'doctor', 'patient'] },
  { to: '/app/discharge', label: 'Discharge summary', icon: FileText, roles: ['doctor', 'nurse'] },
  { to: '/app/interactions', label: 'Drug interactions', icon: Pill, roles: ALL },
  { to: '/app/admin', label: 'Admin', icon: Shield, roles: ['admin'] },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon, roles: ALL },
];

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('cura.theme', dark ? 'dark' : 'light');
  }, [dark]);
  return (
    <button className="btn-ghost" aria-label="Toggle theme" onClick={() => setDark(!dark)}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-fg"><Activity size={16} /></span>
      Cura Nexus
    </Link>
  );
}

function Shell() {
  const user = useSession();
  const navigate = useNavigate();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface p-3 md:flex">
        <div className="mb-4 px-2"><Logo /></div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/app'} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${isActive ? 'bg-accent-soft font-medium text-fg' : 'text-fg-muted hover:bg-surface-2'}`}>
              <n.icon size={16} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <Link to="/problem-statement" className="px-2 text-xs text-fg-subtle hover:underline">Problem statement</Link>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2">
          <select className="input w-48 md:hidden" value="" onChange={(e) => navigate(e.target.value)} aria-label="Navigate">
            <option value="">Go to…</option>
            {NAV.filter((n) => n.roles.includes(user.role)).map((n) => <option key={n.to} value={n.to}>{n.label}</option>)}
          </select>
          <div className="hidden items-center gap-2 text-sm text-fg-muted md:flex"><Gauge size={14} /> Local mode · data stored in this browser</div>
          <div className="flex items-center gap-2">
            <span className="text-sm"><b>{user.name}</b> <span className="badge ml-1 capitalize">{user.role}</span></span>
            <ThemeToggle />
            <button className="btn-ghost" onClick={() => { logout(); navigate('/'); }}><LogOut size={16} /> Sign out</button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}

function Guard({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const user = useSession();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <div className="card">You do not have access to this page.</div>;
  return children;
}

const roleOf = (to: string) => NAV.find((n) => n.to === to)!.roles;

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/problem-statement" element={<ProblemStatement />} />
        <Route path="/app" element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="patients" element={<Guard roles={STAFF}><PatientList /></Guard>} />
          <Route path="patients/new" element={<Guard roles={STAFF}><PatientForm /></Guard>} />
          <Route path="patients/:id/edit" element={<Guard roles={STAFF}><PatientForm /></Guard>} />
          <Route path="patients/:id" element={<Guard roles={ALL}><PatientRecord /></Guard>} />
          <Route path="fhir" element={<Guard roles={STAFF}><FhirViewer /></Guard>} />
          <Route path="modules" element={<Guard roles={STAFF}><Modules /></Guard>} />
          <Route path="risk" element={<RiskChecks />} />
          <Route path="calculators" element={<Calculators />} />
          <Route path="chat" element={<Chat />} />
          <Route path="icu" element={<Guard roles={STAFF}><Icu /></Guard>} />
          <Route path="beds" element={<Guard roles={STAFF}><Beds /></Guard>} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="billing" element={<Guard roles={roleOf('/app/billing')}><Billing /></Guard>} />
          <Route path="discharge" element={<Guard roles={roleOf('/app/discharge')}><Discharge /></Guard>} />
          <Route path="interactions" element={<Interactions />} />
          <Route path="admin" element={<Guard roles={['admin']}><Admin /></Guard>} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
