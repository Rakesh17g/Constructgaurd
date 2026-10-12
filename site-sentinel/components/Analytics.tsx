import React, { useMemo, useState, useEffect } from 'react';
import { Download, BarChart3, ShieldAlert, CircleCheck, CalendarDays, Info, RefreshCw, Activity, CheckCircle2, Clock, AlertTriangle, ShieldCheck, FileText } from 'lucide-react';
import { Inspection, Site, downloadReport, isActive, risk, dateLabel } from '../types';
import { supabase } from '../lib/supabase';
import { ModelBenchmarkSection } from './ModelBenchmarkSection';

type Props = { items: Inspection[]; sites: Site[]; onRefresh?: () => void };
type Range = 'all' | '7' | '30' | '90';
type Source = 'all' | 'sample' | 'recorded';

const pct = (n: number, d: number) => d === 0 ? '—' : `${Math.round((n / d) * 100)}%`;
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const dayKey = (date: Date) => { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const labelDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const Metric: React.FC<{ label: string; value: string | number; note: string; icon: React.ReactNode }> = ({ label, value, note, icon }) => (
  <div className="card metric bg-base-200 border border-base-300">
    <div className="flex items-center justify-between text-base-content/60"><span className="text-xs">{label}</span><span className="opacity-70">{icon}</span></div>
    <strong className="metric-number">{value}</strong>
    <span className="text-[10px] leading-4 text-base-content/50">{note}</span>
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="empty text-base-content/50 py-8 flex flex-col items-center justify-center gap-2">
    <Info size={18} className="opacity-60" />
    <span>{children}</span>
  </div>
);

const TrendChart: React.FC<{ items: Inspection[]; days: number }> = ({ items, days }) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const points = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const key = dayKey(date);
    const rows = items.filter(i => dayKey(new Date(i.created)) === key);
    const assessed = rows.filter(i => i.status !== 'Needs review');
    return { key, count: rows.length, riskCount: assessed.length, mean: assessed.length ? average(assessed.map(i => i.score)) : 0 };
  });
  const plotted = points.filter(p => p.count > 0);
  const maxCount = Math.max(1, ...points.map(p => p.count));
  const width = 760, height = 240, left = 58, right = 58, top = 30, bottom = 46, plotW = width - left - right, plotH = height - top - bottom;
  const x = (index: number) => left + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const yCount = (value: number) => top + plotH - (value / maxCount) * plotH;
  const yRisk = (value: number) => top + plotH - (value / 100) * plotH;
  const riskSegments = points.slice(1).flatMap((p, index) => {
    const previous = points[index];
    return previous.riskCount > 0 && p.riskCount > 0 ? [`${x(index)},${yRisk(previous.mean)} ${x(index + 1)},${yRisk(p.mean)}`] : [];
  });

  return (
    <div className="space-y-3">
      {plotted.length === 0 ? <Empty>No inspections in the selected recent period.</Empty> : (
        <>
          <div className="flex flex-wrap items-center gap-4 text-[10px] text-base-content/60">
            <span><i className="inline-block h-2 w-2 rounded-sm bg-primary mr-1" />Inspections (count)</span>
            <span><i className="inline-block h-2 w-2 rounded-full bg-secondary mr-1" />Mean original risk score</span>
          </div>
          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[540px] w-full" role="img" aria-label={`Daily inspection counts and mean original risk for the last ${days} days`}>
              {[0, .5, 1].map(t => (
                <g key={t}>
                  <line x1={left} x2={width - right} y1={top + plotH * t} y2={top + plotH * t} stroke="currentColor" opacity=".12" />
                  <text x={left - 8} y={top + plotH * t + 4} textAnchor="end" fontSize="9" fill="currentColor" opacity=".5">{Math.round(maxCount * (1 - t))}</text>
                  <text x={width - right + 8} y={top + plotH * t + 4} textAnchor="start" fontSize="9" fill="currentColor" opacity=".5">{Math.round(100 - t * 100)}</text>
                </g>
              ))}
              <text x={left} y={13} textAnchor="start" fontSize="9" fill="currentColor" opacity=".6">Inspections (count)</text>
              <text x={width - right} y={13} textAnchor="end" fontSize="9" fill="currentColor" opacity=".6">Original risk (0–100)</text>
              {points.map((p, i) => (
                <rect key={`bar-${p.key}`} x={x(i) - Math.max(2, plotW / points.length * .22)} y={yCount(p.count)} width={Math.max(4, plotW / points.length * .44)} height={top + plotH - yCount(p.count)} rx="2" className="fill-primary" opacity=".8" />
              ))}
              {riskSegments.map((segment, i) => (
                <polyline key={`risk-segment-${i}`} points={segment} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" className="text-secondary" />
              ))}
              {points.map((p, i) => (
                <g key={p.key}>
                  <circle cx={x(i)} cy={yRisk(p.mean)} r={p.riskCount ? 3 : 0} className="fill-secondary" />
                  {(i === 0 || i === points.length - 1 || i % Math.max(1, Math.floor(points.length / 4)) === 0) && (
                    <text x={x(i)} y={height - 12} textAnchor="middle" fontSize="9" fill="currentColor" opacity=".55">{labelDay(p.key)}</text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        </>
      )}
      <p className="text-[10px] text-base-content/50">Bars show daily inspection counts; dots and dashed segments show mean original risk on days with assessed records. Needs-review records are excluded from risk means, not from counts. Closure does not rewrite risk.</p>
    </div>
  );
};

export const Analytics: React.FC<Props> = ({ items, sites, onRefresh }) => {
  const [range, setRange] = useState<Range>('all');
  const [source, setSource] = useState<Source>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Trigger data refresh on component mount or revisit
  useEffect(() => {
    onRefresh?.();
  }, [onRefresh]);

  // Supabase Realtime channel subscription with cleanup
  useEffect(() => {
    try {
      const channel = supabase
        .channel('public:inspections:analytics')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inspections' },
          () => {
            onRefresh?.();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Realtime subscription fallback to storage sync:', err);
    }
  }, [onRefresh]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const now = Date.now();
  const filtered = useMemo(() => items.filter(item => {
    const sourceMatch = source === 'all' || (source === 'sample' ? item.demo : !item.demo);
    const age = now - new Date(item.created).getTime();
    const rangeMatch = range === 'all' || (age >= -86400000 && age <= Number(range) * 86400000);
    return sourceMatch && rangeMatch;
  }), [items, range, source, now]);

  // Operational metrics calculations
  const totalReportsCount = filtered.length;
  const needsReviewCount = filtered.filter(i => i.score === 0 && i.status === 'Needs review').length;
  const scored = filtered.filter(i => i.status !== 'Needs review');
  const openReports = filtered.filter(i => i.status === 'Open');
  const inProgressReports = filtered.filter(i => i.status === 'In progress');
  const awaitingVerification = filtered.filter(i => i.status === 'Awaiting verification');
  const resolvedReports = filtered.filter(i => i.status === 'Resolved');
  const compliantReports = filtered.filter(i => i.status === 'Compliant');

  // Total closed reports (Resolved + Compliant)
  const totalClosedCount = resolvedReports.length + compliantReports.length;

  // Unresolved violation reports
  const activeUnresolved = filtered.filter(isActive);
  const violationRecords = filtered.filter(i => i.score > 0 && i.status !== 'Compliant');
  const meanRisk = average(scored.map(i => i.score));

  // Violations & detections counts
  const totalMissingHelmets = filtered.reduce((n, i) => n + i.helmets, 0);
  const totalMissingVests = filtered.reduce((n, i) => n + i.vests, 0);
  const totalViolationsDetected = totalMissingHelmets + totalMissingVests;
  const totalPersonsDetected = filtered.reduce((n, i) => n + (i.analysis?.persons || 0), 0);

  // Risk bands
  const bands = [
    { name: 'Low', min: 1, max: 29, cls: 'badge-success' },
    { name: 'Medium', min: 30, max: 59, cls: 'badge-warning' },
    { name: 'High', min: 60, max: 79, cls: 'badge-error' },
    { name: 'Critical', min: 80, max: 100, cls: 'badge-error' }
  ];

  // Site rows breakdown
  const siteRows = sites.map(site => {
    const rows = filtered.filter(i => i.site === site.id);
    const scoredRows = rows.filter(i => i.status !== 'Needs review');
    const open = scoredRows.filter(isActive);
    const violations = rows.reduce((acc, i) => acc + i.helmets + i.vests, 0);
    return {
      site,
      count: rows.length,
      violations,
      scoredCount: scoredRows.length,
      mean: average(scoredRows.map(i => i.score)),
      maxOpen: open.length ? Math.max(...open.map(i => i.score)) : null
    };
  }).filter(row => row.count > 0);

  const recentDays = range === '7' ? 7 : 14;

  // Recent inspection records sorted by date descending (limit to latest 6)
  const recentInspections = useMemo(() => {
    return [...filtered]
      .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
      .slice(0, 6);
  }, [filtered]);

  return (
    <div className="section-stack space-y-8">
      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 1: LIVE OPERATIONAL SAFETY & INSPECTION ANALYTICS
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-6" id="live-operational-analytics">
        {/* Section Header with Live Indicators */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-base-300 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-success" />
              <h2 className="text-base font-bold tracking-tight">Live Operational Safety &amp; Inspection Analytics</h2>
              <span className="badge badge-sm badge-success badge-soft font-semibold">Live Workspace</span>
            </div>
            <p className="text-xs text-base-content/60 mt-0.5">
              Real-time operational records, supervisor inspection submissions, AI hazard findings, and resolution workflows.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              className={`btn btn-xs btn-outline gap-1.5 ${isRefreshing ? 'loading' : ''}`}
              title="Refresh live inspection analytics"
            >
              <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Syncing…' : 'Sync Records'}</span>
            </button>
          </div>
        </div>

        {/* Scope Toolbar */}
        <div className="toolbar card bg-base-200 border border-base-300 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <CalendarDays size={15} className="opacity-60" /> Analytics scope
          </div>
          <select className="select select-bordered select-sm" aria-label="Date range" value={range} onChange={e => setRange(e.target.value as Range)}>
            <option value="all">All dates</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <select className="select select-bordered select-sm" aria-label="Data source" value={source} onChange={e => setSource(e.target.value as Source)}>
            <option value="all">All sources</option>
            <option value="sample">Sample data</option>
            <option value="recorded">Recorded inspections</option>
          </select>
          <button className="btn btn-outline btn-sm ml-auto" onClick={() => downloadReport(filtered, sites)}>
            <Download size={15} />Export filtered CSV
          </button>
        </div>

        <p className="text-[10px] text-base-content/50">
          Showing {filtered.length} inspection record{filtered.length === 1 ? '' : 's'}. Live counts reflect actual persistent records and update automatically upon report submission or closure.
        </p>

        {/* Operational Primary Metric Cards */}
        <div className="metric-grid">
          <Metric
            label="Total Inspections"
            value={totalReportsCount}
            note="Unique submitted reports"
            icon={<BarChart3 size={16} />}
          />
          <Metric
            label="PPE Violations Detected"
            value={totalViolationsDetected}
            note={`${totalMissingHelmets} helmets · ${totalMissingVests} vests`}
            icon={<ShieldAlert size={16} />}
          />
          <Metric
            label="Unresolved Reports"
            value={activeUnresolved.length}
            note="Open, In progress, or Awaiting verification"
            icon={<Clock size={16} />}
          />
          <Metric
            label="Resolution Rate"
            value={pct(resolvedReports.length, violationRecords.length)}
            note={`${resolvedReports.length} resolved / ${violationRecords.length} scored violation reports`}
            icon={<CircleCheck size={16} />}
          />
        </div>

        {/* Workflow Status Distribution Pipeline */}
        <section className="card panel bg-base-200 border border-base-300 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                <FileText size={14} className="opacity-60" /> Inspection Workflow Status Pipeline
              </h3>
              <p className="text-[11px] text-base-content/50">Distribution of unique reports across workflow stages</p>
            </div>
            <span className="badge badge-sm badge-outline text-[11px]">{totalReportsCount} Unique Reports</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-lg bg-base-300/60 border border-base-300">
              <span className="text-[10px] text-base-content/60 block">Needs review</span>
              <strong className="text-base text-base-content">{needsReviewCount}</strong>
            </div>
            <div className="p-2.5 rounded-lg bg-error/10 border border-error/20">
              <span className="text-[10px] text-error block">Open</span>
              <strong className="text-base text-error">{openReports.length}</strong>
            </div>
            <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/20">
              <span className="text-[10px] text-warning block">In progress</span>
              <strong className="text-base text-warning">{inProgressReports.length}</strong>
            </div>
            <div className="p-2.5 rounded-lg bg-info/10 border border-info/20">
              <span className="text-[10px] text-info block">Awaiting verification</span>
              <strong className="text-base text-info">{awaitingVerification.length}</strong>
            </div>
            <div className="p-2.5 rounded-lg bg-success/10 border border-success/20">
              <span className="text-[10px] text-success block">Resolved</span>
              <strong className="text-base text-success">{resolvedReports.length}</strong>
            </div>
            <div className="p-2.5 rounded-lg bg-success/20 border border-success/30">
              <span className="text-[10px] text-success block">Compliant</span>
              <strong className="text-base text-success">{compliantReports.length}</strong>
            </div>
          </div>
        </section>

        {/* Risk Bands & Detections Breakdown */}
        <div className="overview-grid">
          <section className="card panel bg-base-200 border border-base-300">
            <div className="panel-heading">
              <div>
                <h3>Original risk bands</h3>
                <p>Scores are not lowered when records close. Zero-score records do not establish low safety risk.</p>
              </div>
              <span className="badge badge-outline">{scored.length} scored · {needsReviewCount} needs review</span>
            </div>
            {scored.length || needsReviewCount ? (
              <div className="space-y-3 px-6 pb-5">
                {bands.map(b => {
                  const count = scored.filter(i => i.score >= b.min && i.score <= b.max).length;
                  return (
                    <div key={b.name} className="flex items-center gap-3 text-xs">
                      <span className={`badge ${b.cls} w-20`}>{b.name}</span>
                      <progress className="progress progress-primary flex-1" value={count} max={scored.length || 1} />
                      <strong className="w-8 text-right">{count}</strong>
                    </div>
                  );
                })}
                {needsReviewCount > 0 && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="badge badge-outline w-20">Review</span>
                    <div className="flex-1 text-base-content/60">Zero-score needs review (not risk-banded)</div>
                    <strong className="w-8 text-right">{needsReviewCount}</strong>
                  </div>
                )}
                <p className="text-[10px] text-base-content/50">
                  Risk-band percentages use {scored.length} scored record{scored.length === 1 ? '' : 's'}.
                </p>
              </div>
            ) : <Empty>No records match this scope.</Empty>}
          </section>

          <section className="card panel bg-base-200 border border-base-300">
            <div className="panel-heading">
              <div>
                <h3>PPE Object Detection Totals</h3>
                <p>Counts of specific model detections across submitted evidence.</p>
              </div>
            </div>
            {filtered.length ? (
              <div className="grid grid-cols-2 gap-3 px-6 pb-5">
                <div className="rounded-lg bg-base-300 p-4">
                  <span className="text-[10px] text-base-content/60">Missing helmets</span>
                  <strong className="mt-2 block text-2xl text-error">{totalMissingHelmets}</strong>
                  <span className="text-[10px] text-base-content/50">violations flagged</span>
                </div>
                <div className="rounded-lg bg-base-300 p-4">
                  <span className="text-[10px] text-base-content/60">Missing safety vests</span>
                  <strong className="mt-2 block text-2xl text-warning">{totalMissingVests}</strong>
                  <span className="text-[10px] text-base-content/50">violations flagged</span>
                </div>
                <div className="rounded-lg bg-base-300 p-3 col-span-2 flex justify-between items-center text-xs">
                  <span className="text-base-content/70">Total workers/persons detected in scope:</span>
                  <strong className="text-base-content">{totalPersonsDetected || '—'}</strong>
                </div>
              </div>
            ) : <Empty>No detection totals to show.</Empty>}
          </section>
        </div>

        {/* Site & Zone Breakdown Table */}
        <section className="card panel bg-base-200 border border-base-300">
          <div className="panel-heading">
            <div>
              <h3>Safety Risk by Construction Site &amp; Zone</h3>
              <p>Reports count, total PPE violations detected, and maximum open risk score.</p>
            </div>
          </div>
          {siteRows.length ? (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Site Name</th>
                    <th className="text-center">Reports</th>
                    <th className="text-center">PPE Violations</th>
                    <th className="text-center">Original Mean Risk</th>
                    <th className="text-center">Max Open Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {siteRows.map(r => (
                    <tr key={r.site.id}>
                      <td>
                        <strong>{r.site.name}</strong>
                        <small className="block text-base-content/50">{r.site.location}</small>
                      </td>
                      <td className="text-center font-semibold">{r.count}</td>
                      <td className="text-center">
                        <span className={`badge badge-sm ${r.violations > 0 ? 'badge-error' : 'badge-ghost'}`}>
                          {r.violations}
                        </span>
                      </td>
                      <td className="text-center">
                        {r.scoredCount ? (
                          <>
                            {Math.round(r.mean)}/100{' '}
                            <span className={`badge badge-xs ${r.mean >= 60 ? 'badge-error' : r.mean >= 30 ? 'badge-warning' : 'badge-success'}`}>
                              {risk(r.mean)}
                            </span>
                          </>
                        ) : <span className="text-base-content/50">No scored records</span>}
                      </td>
                      <td className="text-center font-bold">
                        {r.maxOpen === null ? <span className="text-base-content/50 text-xs">None</span> : `${r.maxOpen}/100`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No site records match this scope.</Empty>}
        </section>

        {/* Trend Chart */}
        <section className="card panel bg-base-200 border border-base-300">
          <div className="panel-heading">
            <div>
              <h3>Recent Inspection Activity &amp; Risk Trend</h3>
              <p>Daily activity and mean original risk · last {recentDays} days</p>
            </div>
          </div>
          <div className="px-5 pb-4">
            <TrendChart items={filtered} days={recentDays} />
          </div>
        </section>

        {/* Recent Inspection Activity Feed */}
        <section className="card panel bg-base-200 border border-base-300">
          <div className="panel-heading">
            <div>
              <h3>Recent Inspection Activity</h3>
              <p>Latest inspection records submitted across all construction sites.</p>
            </div>
            <span className="badge badge-sm badge-outline">{recentInspections.length} Latest Records</span>
          </div>
          {recentInspections.length ? (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr className="text-[11px] bg-base-300/40">
                    <th>Report ID</th>
                    <th>Site &amp; Zone</th>
                    <th>Date</th>
                    <th className="text-center">Violations</th>
                    <th className="text-center">Risk Score</th>
                    <th>Status</th>
                    <th>Supervisor</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInspections.map(i => {
                    const siteName = sites.find(s => s.id === i.site)?.name || i.site;
                    return (
                      <tr key={i.id} className="hover:bg-base-300/30 text-xs">
                        <td className="font-mono font-bold text-primary">{i.id}</td>
                        <td>
                          <span className="font-medium">{siteName}</span>
                          <span className="block text-[10px] text-base-content/50">{i.zone}</span>
                        </td>
                        <td className="text-[11px] text-base-content/70">{dateLabel(i.created)}</td>
                        <td className="text-center">
                          {i.helmets + i.vests > 0 ? (
                            <span className="badge badge-xs badge-error">
                              {i.helmets}H + {i.vests}V
                            </span>
                          ) : (
                            <span className="badge badge-xs badge-success">Clean</span>
                          )}
                        </td>
                        <td className="text-center font-bold">
                          {i.score}/100
                        </td>
                        <td>
                          <span className={`badge badge-xs ${i.status === 'Resolved' || i.status === 'Compliant' ? 'badge-success' :
                              i.status === 'Open' ? 'badge-error' :
                                i.status === 'In progress' ? 'badge-warning' : 'badge-ghost'
                            }`}>
                            {i.status}
                          </span>
                        </td>
                        <td className="text-base-content/70 text-[11px]">{i.owner || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty>No recent inspection activity found.</Empty>}
        </section>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          VISUAL SEPARATOR: DISTINCT BOUNDARY BETWEEN OPERATIONAL DATA & BENCHMARKS
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="relative py-4">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t-2 border-dashed border-base-300"></div>
        </div>
        <div className="relative flex justify-center">
          <span className="bg-base-100 px-4 text-xs font-bold text-base-content/50 uppercase tracking-widest flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
            Empirical Model Evaluation Boundary
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 2: MODEL BENCHMARK & INNOVATION ANALYTICS
          ════════════════════════════════════════════════════════════════════════ */}
      <ModelBenchmarkSection />
    </div>
  );
};
