import React from 'react';
import { ShieldCheck, LayoutDashboard, ScanLine, ClipboardCheck, Building2, Layers, ArrowUpRight, HardHat, ChartNoAxesCombined, LogOut } from 'lucide-react';

interface NavigationProps {
    page: string;
    setPage: (s: string) => void;
    active: number;
    save: string;
    userEmail?: string;
    onSignOut?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({ page, setPage, active, save, userEmail, onSignOut }) => {
    const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : 'RG';
    const displayName = userEmail ? userEmail.split('@')[0] : 'Rakesh G';

    return (
        <aside className="sidebar bg-base-200 border-base-300">
            <div className="brand">
                <span style={{ width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </span>
                <div>
                    <strong>Construct gaurd<span className="text-primary">.</span></strong>
                    <small className="text-base-content/50">SAFETY INTELLIGENCE</small>
                </div>
            </div>
            <p className="nav-label text-base-content/40">WORKSPACE</p>
            <nav>
                {([['Overview', LayoutDashboard], ['Inspections', ScanLine], ['Corrective actions', ClipboardCheck], ['Sites & zones', Building2], ['Analytics', ChartNoAxesCombined]] as [string, React.FC<{ size: number }>][]).map(([name, Icon]) => (
                    <button
                        key={name}
                        className={`btn btn-ghost nav-item ${page === name ? 'bg-primary/10 text-primary' : ''}`}
                        onClick={() => setPage(name)}
                    >
                        <Icon size={19} />
                        <span>{name}</span>
                        {name === 'Corrective actions' && <span className="badge badge-sm badge-outline">{active}</span>}
                    </button>
                ))}
            </nav>
            <div className="sidebar-bottom">
                <div className="card bg-base-100 p-4 gap-3">
                    <span className="text-primary"><HardHat size={23} /></span>
                    <strong className="text-sm">Safer sites. Closed loops.</strong>
                    <p className="text-xs text-base-content/60 leading-relaxed">From an observation to a verified correction.</p>
                    <button className="btn btn-sm btn-ghost justify-between" onClick={() => setPage('Project & system')}>
                        Explore the project <ArrowUpRight size={15} />
                    </button>
                </div>
                <button
                    className={`btn btn-ghost nav-item ${page === 'Project & system' ? 'text-primary' : ''}`}
                    onClick={() => setPage('Project & system')}
                >
                    <Layers size={18} />Project &amp; system
                </button>
                <div className="profile border-base-300">
                    <div className="avatar placeholder">
                        <div className="bg-primary/15 text-primary rounded-full w-9">{initials}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <strong className="text-xs" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName}
                        </strong>
                        <small className="text-base-content/50">Workspace {save}</small>
                    </div>
                    {onSignOut && (
                        <button
                            onClick={onSignOut}
                            title="Sign out"
                            aria-label="Sign out"
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'rgba(255,255,255,0.35)',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.15s ease',
                                flexShrink: 0,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
                        >
                            <LogOut size={15} />
                        </button>
                    )}
                </div>
            </div>
        </aside>
    );
};
