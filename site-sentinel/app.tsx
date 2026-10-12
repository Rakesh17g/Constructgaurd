import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Plus, Download, Search, ChevronRight, Layers, X, ShieldCheck } from 'lucide-react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Store, Inspection, seed, isActive, downloadReport, Role } from './types';
import { Navigation } from './components/Navigation';
import { Overview, InspectionTable } from './components/Overview';
import { InspectionForm } from './components/InspectionForm';
import { Detail } from './components/Detail';
import { Actions, Sites, Project } from './components/Workspace';
import { Analytics } from './components/Analytics';
import { Hero3D } from './components/Hero3D';
import { Auth } from './components/Auth';
import './styles.css';

const subtitles: Record<string, string> = {
    'Analytics': 'Safety patterns, site comparisons, and corrective-action performance.',
    'Overview': 'Your sites, your people, a safer day ahead.',
    'Inspections': 'Evidence, observations, and explainable risk in one place.',
    'Corrective actions': 'Turn safety observations into verified resolutions.',
    'Sites & zones': 'One workspace. Every construction site.',
    'Project & system': 'The idea, the workflow, and what comes next.',
};

/* ── Global auth loading screen ─────────────────────────── */
const AuthLoader = () => (
    <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#050506', fontFamily: 'Inter, sans-serif', flexDirection: 'column', gap: 16,
    }}>
        <div style={{
            width: 34, height: 34, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.12)', borderTopColor: '#fff',
            animation: 'auth-spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 10, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
            Loading session
        </span>
        <style>{`@keyframes auth-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
);

/* ── Main dashboard (only rendered when authenticated) ───── */
const Dashboard: React.FC<{ user: User; role: Role; onSignOut: () => void }> = ({ user, role, onSignOut }) => {
    const [store, S] = useState<Store>(seed());
    const [page, P] = useState(role === 'reporter' ? 'Inspections' : 'Overview');
    const [site, Site] = useState('all');
    const [query, Q] = useState('');
    const [status, Status] = useState('all');
    const [upload, U] = useState(false);
    const [detail, D] = useState<string | null>(null);
    const [ready, Ready] = useState(false);
    const [saveState, SaveState] = useState('loading');
    const [message, Message] = useState('');
    const saving = useRef(false);

    const refreshData = () => {
        try {
            const text = localStorage.getItem('site-sentinel-data');
            if (text) {
                const d = JSON.parse(text);
                if (d.version === 1 && Array.isArray(d.sites) && Array.isArray(d.inspections)) {
                    S(d);
                    SaveState('saved');
                }
            }
        } catch (err) {
            console.error('Data refresh error:', err);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                const text = localStorage.getItem('site-sentinel-data') || JSON.stringify(seed());
                const d = JSON.parse(text);
                if (d.version !== 1 || !Array.isArray(d.sites) || !Array.isArray(d.inspections))
                    throw Error('Invalid workspace data.');
                S(d); Ready(true); SaveState('saved');
            } catch (err) {
                console.error(err);
                try { S(seed()); Ready(true); SaveState('saved'); }
                catch { SaveState('load failed'); Message('Could not load saved records. Editing is disabled to protect your data.'); }
            }
        };
        loadData();
    }, []);

    // Sync across browser tabs and local updates
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'site-sentinel-data') {
                refreshData();
            }
        };
        const handleCustomUpdate = () => {
            refreshData();
        };
        window.addEventListener('storage', handleStorage);
        window.addEventListener('constructgaurd:data-updated', handleCustomUpdate);
        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('constructgaurd:data-updated', handleCustomUpdate);
        };
    }, []);

    // Automatically re-fetch fresh records when Analytics page is opened
    useEffect(() => {
        if (page === 'Analytics') {
            refreshData();
        }
    }, [page]);

    useEffect(() => {
        if (!message) return;
        const t = setTimeout(() => Message(''), 9000);
        return () => clearTimeout(t);
    }, [message]);

    async function commit(next: Store) {
        if (!ready || saving.current) { Message('Please wait for the current save to finish.'); return; }
        const previous = store; saving.current = true; S(next); SaveState('saving');
        try {
            localStorage.setItem('site-sentinel-data', JSON.stringify(next));
            window.dispatchEvent(new CustomEvent('constructgaurd:data-updated'));
            SaveState('saved');
        } catch (err) {
            console.error(err); S(previous); SaveState('save failed');
            Message('Changes could not be saved and were rolled back. Please try again.');
        } finally { saving.current = false; }
    }

    const items = store.inspections.filter(i => {
        if (site !== 'all' && i.site !== site) return false;
        if (role === 'reporter' && i.owner !== user.email) return false;
        return true;
    });
    const filtered = items.filter(i =>
        (status === 'all' || i.status === status) &&
        [i.id, i.zone, i.owner, store.sites.find(s => s.id === i.site)?.name || '']
            .join(' ').toLowerCase().includes(query.toLowerCase())
    );
    const sites = store.sites.filter(s => site === 'all' || s.id === site);
    const selected = store.inspections.find(i => i.id === detail);
    const active = items.filter(isActive).length;

    function saveInspection(i: Inspection) {
        if (saving.current) return Message('A save is in progress. Please try again in a moment.');
        commit({
            ...store,
            inspections: store.inspections.some(n => n.id === i.id)
                ? store.inspections.map(n => n.id === i.id ? i : n)
                : [i, ...store.inspections],
        });
        U(false);
    }

    const Modals = () => (
        <>
            {upload && ready && <InspectionForm sites={store.sites} inspections={store.inspections} userEmail={user.email!} role={role} close={() => U(false)} save={saveInspection} />}
            {selected && ready && <Detail key={selected.id + selected.history.length} item={selected} sites={store.sites} close={() => D(null)} save={saveInspection} userEmail={user.email} role={role} />}
            {message && (
                <div className="toast-message alert bg-base-200 border border-base-300 shadow-xl">
                    <span>{message}</span>
                    <button aria-label="Dismiss" onClick={() => Message('')}><X size={17} /></button>
                </div>
            )}
        </>
    );



    return (
        <div className="app-layout bg-base-100 text-base-content">
            <Navigation
                page={page} setPage={P} active={active} save={saveState}
                userEmail={user.email} role={role} onSignOut={onSignOut}
            />
            <main className="main">
                <header className="topbar border-base-300">
                    <div className="flex items-center gap-2 text-xs text-base-content/50">
                        <Layers size={15} /><span>Workspace</span><ChevronRight size={13} />
                        <span className="text-base-content">{page}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="badge badge-outline badge-warning">AI-Powered Safety</span>
                        <select aria-label="Filter sites" className="select select-bordered select-sm text-xs max-w-48" value={site} onChange={e => Site(e.target.value)}>
                            <option value="all">All construction sites</option>
                            {store.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                </header>
                <div className="page-heading">
                    <div>
                        <h1>{page}</h1>
                        <p className="text-base-content/50">{subtitles[page]}</p>
                    </div>
                    <div className="flex gap-2">
                        {page !== 'Project & system' && (
                            <button className="btn btn-ghost btn-sm" title="Export current filtered inspections"
                                onClick={() => downloadReport(page === 'Inspections' ? filtered : items, store.sites)}>
                                <Download size={16} /><span className="hidden sm:inline">Export CSV</span>
                            </button>
                        )}
                        <button className="btn btn-primary btn-sm" disabled={!ready} onClick={() => U(true)}>
                            <Plus size={16} />New inspection
                        </button>
                    </div>
                </div>
                {store.inspections.some(i => i.demo) && (
                    <div className="notice bg-base-200 text-base-content/50 mb-5">
                        Sample records are illustrative and kept separate in Analytics. New uploads run real YOLO detection; a zero-detection result still requires human review.
                    </div>
                )}
                {!ready && (
                    <div className="notice bg-warning/10 text-warning mb-4">
                        {saveState === 'loading' ? 'Loading saved workspace…' : 'Workspace unavailable. Editing is disabled until saved data can be loaded.'}
                    </div>
                )}
                {(page === 'Overview' && role !== 'reporter') && (
                    <Overview items={items} sites={store.sites} open={(i) => D(i.id)} go={P} upload={() => U(true)} />
                )}
                {(page === 'Inspections' && role === 'reporter') && (
                    <div className="section-stack">
                        <div className="toolbar">
                            <label className="input input-bordered">
                                <Search size={16} className="opacity-50" />
                                <input className="grow" placeholder="Search zone, supervisor or inspection…" value={query} onChange={e => Q(e.target.value)} />
                            </label>
                            <select aria-label="Filter inspection status" className="select select-bordered" value={status} onChange={e => Status(e.target.value)}>
                                <option value="all">All statuses</option>
                                {['Needs review', 'Open', 'In progress', 'Awaiting verification', 'Resolved', 'Compliant'].map(s => <option key={s}>{s}</option>)}
                            </select>
                            <span className="text-xs text-base-content/50">{filtered.length} records</span>
                        </div>
                        <section className="card panel bg-base-200">
                            <InspectionTable items={filtered} sites={store.sites} open={i => D(i.id)} />
                        </section>
                    </div>
                )}
                {(page === 'Corrective actions' && role !== 'reporter') && <Actions items={items} sites={store.sites} open={i => D(i.id)} />}
                {(page === 'Sites & zones' && role !== 'reporter') && <Sites sites={sites} items={items} add={s => commit({ ...store, sites: [...store.sites, s] })} view={id => { Site(id); P('Inspections'); Status('all'); Q(''); }} />}
                {page === 'Project & system' && <Project />}
                {(page === 'Analytics' && role !== 'reporter') && <Analytics items={items} sites={sites} onRefresh={refreshData} />}
                <footer className="footer text-base-content/40">
                    <span>Construct gaurd · Construction safety, from insight to action.</span>
                    <button className="hover:text-primary" onClick={() => P('Project & system')}>Project &amp; system ↗</button>
                    <span>Workspace {saveState} · Decision support only</span>
                </footer>
            </main>
            <Modals />
        </div>
    );
};

/* ── Root App — handles session state and routing ─────────── */
const App: React.FC = () => {
    const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = loading
    const [role, setRole] = useState<Role | null>(null);

    // Initial view starts explicitly waiting for session rather than forcing 'hero' immediately
    const [view, setView] = useState<'hero' | 'auth' | 'dashboard'>('hero');
    const [intendedRole, setIntendedRole] = useState<'reporter' | 'safety_officer' | null>(null);
    const [authError, setAuthError] = useState('');
    const [isInitializing, setIsInitializing] = useState(true);

    const fetchRole = async (u?: User | null): Promise<Role | null> => {
        if (!u) {
            setRole(null);
            return null;
        }
        try {
            const { data, error } = await supabase.from('users').select('role').eq('id', u.id).single();
            if (error) {
                console.warn('Profile load diagnostic (safe to ignore if provisioning/RLS block):', error.message);
            }
            if (!error && data?.role) {
                let r: Role = 'reporter';
                if (data.role === 'admin') {
                    r = 'admin';
                } else if (data.role === 'safety_officer' || data.role === 'inspector') {
                    r = 'safety_officer';
                } else if (data.role === 'reporter' || data.role === 'worker') {
                    r = 'reporter';
                }
                setRole(r);
                return r;
            } else {
                setRole(null);
                return null;
            }
        } catch (err) {
            console.error('Network or unexpected profile query error:', err);
            setRole(null);
            return null;
        }
    };

    useEffect(() => {
        // Parse implicit flow verification errors from URL hash
        const hash = window.location.hash;
        if (hash) {
            const params = new URLSearchParams(hash.substring(1));
            const errDesc = params.get('error_description') || params.get('error');
            if (errDesc) {
                const clean = errDesc.toLowerCase().includes('expired')
                    ? 'Your email verification link has expired. Please sign in to request a new one.'
                    : errDesc.replace(/\+/g, ' ');
                setAuthError(clean);
                window.history.replaceState(null, '', window.location.pathname);
            }
        }

        const handleAuthContextUpdate = async (s: Session | null) => {
            if (!s) {
                setSession(null);
                setRole(null);
                setView((prev) => prev === 'dashboard' ? 'hero' : prev);
                setIsInitializing(false);
                return;
            }

            setSession(s);
            const fetchedRole = await fetchRole(s.user);

            if (!fetchedRole) {
                setIsInitializing(false);
                return; // Retain current view, fallback UI handles 'missing role' later
            }

            // Only transition to Dashboard instantly if they aren't purposely in Auth with an active role mismatch trap.
            setView((prevView) => {
                // If they reloaded explicitly on the hero, redirect strictly back into their workspace
                if (prevView === 'hero' || prevView === 'auth') {
                    return 'dashboard';
                }
                return prevView;
            });
            setIsInitializing(false);
        };

        // 1. Get initial session securely
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            handleAuthContextUpdate(s);
        });

        // 2. Listen securely avoiding recursive infinite states
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
            // Do not override view maliciously if SIGNED_IN event fires from Auth.tsx while validating intents
            if (_event === 'SIGNED_OUT') {
                setSession(null);
                setRole(null);
                setView('hero');
            } else if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') {
                handleAuthContextUpdate(s);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSignOut = async () => {
        try { await supabase.auth.signOut(); } catch (e) { console.error('Sign-out error:', e); }
        setSession(null);
        setRole(null);
        setView('hero');
        setAuthError('');
    };

    const proceed = async (targetRole: 'reporter' | 'safety_officer') => {
        setIntendedRole(targetRole);
        setAuthError('');
        if (!session) {
            setView('auth');
            return;
        }

        let currentRole = role;
        if (currentRole === null) currentRole = await fetchRole(session.user);

        if (!currentRole) {
            setAuthError('Role not assigned. Contact your administrator to provision this account.');
            return;
        }

        const isOfficer = currentRole === 'safety_officer' || currentRole === 'admin';
        if (targetRole === 'safety_officer' && !isOfficer) {
            setAuthError('This account is registered as a Safety Reporter. Please select Safety Reporter to continue.');
            return;
        }

        if (targetRole === 'reporter' && currentRole === 'safety_officer') {
            setAuthError('This account is registered as a Safety Officer. Please select Safety Officer to continue.');
            return;
        }

        setView('dashboard');
    };

    // Strict race-condition eliminator screen
    if (isInitializing || session === undefined) return <AuthLoader />;

    if (view === 'hero') {
        return (
            <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
                <Hero3D go={(page) => proceed(page as 'reporter' | 'safety_officer')} />
                {authError && (
                    <div className="toast-message alert bg-error text-error-content shadow-xl" style={{ position: 'absolute', bottom: 24, zIndex: 50, left: '50%', transform: 'translateX(-50%)' }}>
                        <span>{authError}</span>
                        <button onClick={() => setAuthError('')}><X size={17} /></button>
                    </div>
                )}
            </div>
        );
    }

    if (view === 'auth') {
        return <Auth intendedRole={intendedRole} onSwitchRole={() => {
            setView('hero');
            setAuthError('');
        }} onAuthenticated={async () => {
            // Local login finished resolving. Validate roles explicitly before transferring them cleanly.
            setIsInitializing(true);
            const { data } = await supabase.auth.getSession();
            setSession(data.session);

            if (data.session) {
                const r = await fetchRole(data.session.user);

                if (!r) {
                    try { await supabase.auth.signOut(); } catch (e) { /* silent */ }
                    setSession(null);
                    setRole(null);
                    setAuthError('Role not assigned. Contact your administrator to provision your account.');
                    setView('hero');
                    setIsInitializing(false);
                    return;
                }

                if (intendedRole === 'safety_officer' && r !== 'safety_officer' && r !== 'admin') {
                    try { await supabase.auth.signOut(); } catch (e) { /* silent */ }
                    setSession(null);
                    setRole(null);
                    setAuthError('This account is registered as a Safety Reporter. Please select Safety Reporter to continue.');
                    setView('hero');
                    setIsInitializing(false);
                    return;
                }

                if (intendedRole === 'reporter' && r === 'safety_officer') {
                    try { await supabase.auth.signOut(); } catch (e) { /* silent */ }
                    setSession(null);
                    setRole(null);
                    setAuthError('This account is registered as a Safety Officer. Please select Safety Officer to continue.');
                    setView('hero');
                    setIsInitializing(false);
                    return;
                }

                setView('dashboard');
                setIsInitializing(false);
            } else {
                setIsInitializing(false);
            }
        }} />;
    }

    // Role missing fallback when dashboard starts directly
    if (!role) {
        return (
            <div className="hero3d-container flex flex-col items-center justify-center p-6 text-center gap-4">
                <ShieldCheck size={48} className="text-warning" />
                <h2 className="text-2xl font-bold">Role not assigned</h2>
                <p className="opacity-70 max-w-sm">Your account has been created but has not been assigned a role. Please contact your administrator to provision your access.</p>
                <div className="flex gap-4 mt-4">
                    <button className="btn btn-outline" onClick={() => setView('hero')}>Return to home</button>
                    <button className="btn btn-ghost" onClick={handleSignOut}>Sign out</button>
                </div>
            </div>
        );
    }

    return <Dashboard user={session.user} role={role} onSignOut={handleSignOut} />;
};

createRoot(document.getElementById('root')!).render(<App />);
