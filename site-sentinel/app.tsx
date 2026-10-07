import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Plus, Download, Search, ChevronRight, Layers, X } from 'lucide-react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Store, Inspection, seed, isActive, downloadReport } from './types';
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
const Dashboard: React.FC<{ user: User; onSignOut: () => void }> = ({ user, onSignOut }) => {
    const [store, S] = useState<Store>(seed());
    const [page, P] = useState('Overview');
    const [site, Site] = useState('all');
    const [query, Q] = useState('');
    const [status, Status] = useState('all');
    const [upload, U] = useState(false);
    const [detail, D] = useState<string | null>(null);
    const [ready, Ready] = useState(false);
    const [saveState, SaveState] = useState('loading');
    const [message, Message] = useState('');
    const saving = useRef(false);

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
            SaveState('saved');
        } catch (err) {
            console.error(err); S(previous); SaveState('save failed');
            Message('Changes could not be saved and were rolled back. Please try again.');
        } finally { saving.current = false; }
    }

    const items = store.inspections.filter(i => site === 'all' || i.site === site);
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
            {upload && ready && <InspectionForm sites={store.sites} inspections={store.inspections} close={() => U(false)} save={saveInspection} />}
            {selected && ready && <Detail key={selected.id + selected.history.length} item={selected} sites={store.sites} close={() => D(null)} save={saveInspection} />}
            {message && (
                <div className="toast-message alert bg-base-200 border border-base-300 shadow-xl">
                    <span>{message}</span>
                    <button aria-label="Dismiss" onClick={() => Message('')}><X size={17} /></button>
                </div>
            )}
        </>
    );

    if (page === 'Overview') {
        return (
            <>
                <Hero3D go={P} />
                <Modals />
            </>
        );
    }

    return (
        <div className="app-layout bg-base-100 text-base-content">
            <Navigation
                page={page} setPage={P} active={active} save={saveState}
                userEmail={user.email} onSignOut={onSignOut}
            />
            <main className="main">
                <header className="topbar border-base-300">
                    <div className="flex items-center gap-2 text-xs text-base-content/50">
                        <Layers size={15} /><span>Workspace</span><ChevronRight size={13} />
                        <span className="text-base-content">{page}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="badge badge-outline badge-warning">YOLO26n · AI prototype</span>
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
                {page === 'Inspections' && (
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
                {page === 'Corrective actions' && <Actions items={items} sites={store.sites} open={i => D(i.id)} />}
                {page === 'Sites & zones' && <Sites sites={sites} items={items} add={s => commit({ ...store, sites: [...store.sites, s] })} view={id => { Site(id); P('Inspections'); Status('all'); Q(''); }} />}
                {page === 'Project & system' && <Project />}
                {page === 'Analytics' && <Analytics items={items} sites={sites} />}
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

    useEffect(() => {
        // 1. Get the initial session (handles page refresh)
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        // 2. Handle password-reset redirect (detectSessionInUrl does this)
        // 3. Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setSession(null);
    };

    // Still checking session
    if (session === undefined) return <AuthLoader />;

    // Not logged in
    if (!session) return <Auth onAuthenticated={() => supabase.auth.getSession().then(({ data }) => setSession(data.session))} />;

    // Logged in — show dashboard
    return <Dashboard user={session.user} onSignOut={handleSignOut} />;
};

createRoot(document.getElementById('root')!).render(<App />);
