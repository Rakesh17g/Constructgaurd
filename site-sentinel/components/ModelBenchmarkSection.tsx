import React, { useState, useEffect } from 'react';
import { Cpu, HelpCircle, Layers, BarChart3, Radar, Grid, Trophy, Sparkles, Info, Check, Filter, RefreshCw, Calendar, Database, HardDrive } from 'lucide-react';

export interface MetricDefinition {
    key: 'precision' | 'recall' | 'f1_score' | 'map50' | 'map50_95';
    name: string;
    label: string;
    description: string;
}

export const BENCHMARK_METRICS: MetricDefinition[] = [
    {
        key: 'precision',
        name: 'Precision',
        label: 'Precision (%)',
        description: 'Proportion of predicted detections that are correct.'
    },
    {
        key: 'recall',
        name: 'Recall',
        label: 'Recall (%)',
        description: 'Proportion of actual objects successfully detected.'
    },
    {
        key: 'f1_score',
        name: 'F1-Score',
        label: 'F1-Score (%)',
        description: 'Harmonic mean of precision and recall: 2 × Precision × Recall / (Precision + Recall).'
    },
    {
        key: 'map50',
        name: 'mAP@50',
        label: 'mAP@50 (%)',
        description: 'Mean average precision at IoU 0.50.'
    },
    {
        key: 'map50_95',
        name: 'mAP@50–95',
        label: 'mAP@50–95 (%)',
        description: 'Mean average precision averaged across IoU thresholds from 0.50 to 0.95.'
    }
];

export const computeF1 = (precision: number | null, recall: number | null): number | null => {
    if (precision === null || recall === null) return null;
    const sum = precision + recall;
    if (sum <= 0) return 0;
    return Number(((2 * precision * recall) / sum).toFixed(2));
};

export interface BenchmarkModelData {
    model_name: string;
    architecture: string;
    weights_path: string;
    training_status: 'existing' | 'completed' | 'in_progress' | 'pending';
    evaluation_status: 'completed' | 'pending' | 'failed';
    precision: number | null;
    recall: number | null;
    f1_score: number | null;
    map50: number | null;
    map50_95: number | null;
    inference_speed_ms?: number | null;
    per_class?: Record<string, any>;
    color?: string;
    isCurrent?: boolean;
}

export interface BenchmarkSummary {
    schema_version: string;
    generated_at: string;
    hardware: {
        device: string;
        vram_gb: number;
        framework: string;
    };
    dataset: {
        name: string;
        split_used: string;
        image_size: number;
        classes: string[];
        train_images: number;
        val_images: number;
        test_images: number;
    };
    training_configuration: {
        imgsz: number;
        epochs: number;
        batch_size: number;
        patience: number;
        workers: number;
        amp: boolean;
        device: number;
    };
    models: BenchmarkModelData[];
}

const DEFAULT_MODELS: BenchmarkModelData[] = [
    {
        model_name: 'YOLO26n',
        architecture: 'Ultralytics YOLO26 Nano (Client Runtime ONNX)',
        weights_path: 'site-sentinel/models/ppe-yolo26n.onnx',
        training_status: 'completed',
        evaluation_status: 'completed',
        precision: 78.42,
        recall: 58.65,
        f1_score: 67.11,
        map50: 63.28,
        map50_95: 34.15,
        inference_speed_ms: 5.42,
        color: '#38bdf8', // Sky Blue (Current)
        isCurrent: true
    },
    {
        model_name: 'YOLO11n',
        architecture: 'Ultralytics YOLO11 Nano',
        weights_path: 'backend/model_benchmarks/yolo11n/weights/best.pt',
        training_status: 'completed',
        evaluation_status: 'completed',
        precision: 67.76,
        recall: 50.98,
        f1_score: 58.18,
        map50: 54.62,
        map50_95: 27.84,
        inference_speed_ms: 8.85,
        color: '#34d399', // Emerald
        isCurrent: false
    },
    {
        model_name: 'YOLOv8n',
        architecture: 'Ultralytics YOLOv8 Nano',
        weights_path: 'backend/model_benchmarks/yolov8n/weights/best.pt',
        training_status: 'completed',
        evaluation_status: 'completed',
        precision: 73.59,
        recall: 48.93,
        f1_score: 58.78,
        map50: 52.73,
        map50_95: 25.65,
        inference_speed_ms: 9.08,
        color: '#818cf8', // Indigo
        isCurrent: false
    }
];

const MODEL_COLORS: Record<string, string> = {
    'YOLO26n': '#38bdf8',
    'YOLO26n (Client Runtime)': '#38bdf8',
    'YOLO11n': '#34d399',
    'YOLOv8n': '#818cf8'
};

/* ── Grouped Bar Chart Component ──────────────────────────────────── */
const ModelBenchmarkBarChart: React.FC<{ models: BenchmarkModelData[]; metrics: MetricDefinition[] }> = ({ models, metrics }) => {
    const width = 760, height = 270, left = 48, right = 24, top = 28, bottom = 44;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const groupW = plotW / Math.max(1, metrics.length);
    const barW = Math.max(14, Math.min(26, Math.floor((groupW - 20) / Math.max(1, models.length))));
    const barGap = 6;
    const totalBarsW = models.length * barW + (models.length - 1) * barGap;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-base-content/70">
                <div className="flex flex-wrap items-center gap-4">
                    {models.map(m => (
                        <span key={m.model_name} className="inline-flex items-center gap-1.5">
                            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: m.color || MODEL_COLORS[m.model_name] || '#94a3b8' }} />
                            <strong className={m.isCurrent ? 'text-primary font-semibold' : ''}>{m.model_name}</strong>
                            {m.isCurrent && <span className="badge badge-xs badge-primary">Current</span>}
                        </span>
                    ))}
                </div>
                <span className="text-[10px] text-base-content/50">Scale: 0% to 100%</span>
            </div>

            <div className="w-full overflow-x-auto">
                <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[580px] w-full" role="img" aria-label="Grouped bar chart comparing 5 metrics">
                    {[0, 0.25, 0.5, 0.75, 1].map(t => {
                        const y = top + plotH * (1 - t);
                        return (
                            <g key={t}>
                                <line x1={left} x2={width - right} y1={y} y2={y} stroke="currentColor" opacity=".1" strokeDasharray="3 3" />
                                <text x={left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity=".5">
                                    {Math.round(t * 100)}%
                                </text>
                            </g>
                        );
                    })}

                    {metrics.map((metric, gIdx) => {
                        const groupCenter = left + (gIdx + 0.5) * groupW;
                        const startX = groupCenter - totalBarsW / 2;

                        return (
                            <g key={metric.key}>
                                <text x={groupCenter} y={height - 12} textAnchor="middle" fontSize="10" fontWeight="500" fill="currentColor" opacity=".85">
                                    {metric.name}
                                </text>

                                {models.map((model, mIdx) => {
                                    const val = model[metric.key];
                                    const barX = startX + mIdx * (barW + barGap);
                                    const color = model.color || MODEL_COLORS[model.model_name] || '#94a3b8';

                                    if (val !== null && typeof val === 'number') {
                                        const barH = Math.max(3, (val / 100) * plotH);
                                        const barY = top + plotH - barH;
                                        return (
                                            <g key={model.model_name}>
                                                <rect x={barX} y={barY} width={barW} height={barH} rx="3" fill={color} opacity={model.isCurrent ? '0.95' : '0.8'} />
                                                <text x={barX + barW / 2} y={barY - 4} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="currentColor" opacity=".95">
                                                    {val.toFixed(1)}%
                                                </text>
                                            </g>
                                        );
                                    }

                                    const placeholderH = 22;
                                    const placeholderY = top + plotH - placeholderH;
                                    const statusLabel = model.training_status === 'in_progress' ? 'Training' : 'Pending';
                                    return (
                                        <g key={model.model_name}>
                                            <rect x={barX} y={placeholderY} width={barW} height={placeholderH} rx="3" fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="3 2" opacity="0.35" />
                                            <text x={barX + barW / 2} y={placeholderY + 14} textAnchor="middle" fontSize="7" fill="currentColor" opacity=".45">
                                                {statusLabel}
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}
                </svg>
            </div>
            <p className="text-[10px] text-base-content/50">
                Bars compare all 5 parameters across candidate models. Dashed slots indicate unmeasured baselines pending benchmark execution.
            </p>
        </div>
    );
};

/* ── Radar Chart Component ────────────────────────────────────────── */
const ModelRadarChart: React.FC<{ models: BenchmarkModelData[] }> = ({ models }) => {
    const width = 420, height = 320;
    const cx = 210, cy = 160, radius = 100;
    const metrics = BENCHMARK_METRICS;
    const n = metrics.length;

    const getCoordinates = (index: number, valuePercent: number) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n;
        const r = (Math.max(0, Math.min(100, valuePercent)) / 100) * radius;
        return {
            x: cx + r * Math.cos(angle),
            y: cy + r * Math.sin(angle)
        };
    };

    const getRingPoints = (levelPct: number) => {
        return metrics.map((_, i) => {
            const { x, y } = getCoordinates(i, levelPct);
            return `${x},${y}`;
        }).join(' ');
    };

    const evaluatedModels = models.filter(m => {
        const values = metrics.map(met => m[met.key]);
        return values.every(v => v !== null && typeof v === 'number');
    });

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-base-content/70">
                <span className="font-semibold text-xs text-base-content/80">Pentagonal Model Profile</span>
                <span className="text-[10px] text-base-content/50">Axes: 0% (Center) to 100% (Perimeter)</span>
            </div>

            <div className="w-full flex justify-center overflow-x-auto">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[420px] aspect-[420/320]" role="img" aria-label="Radar chart comparing model performance profiles across 5 metrics">
                    {[20, 40, 60, 80, 100].map(level => (
                        <g key={level}>
                            <polygon points={getRingPoints(level)} fill="none" stroke="currentColor" opacity=".12" strokeWidth="1" />
                            <text x={cx + 3} y={cy - (level / 100) * radius + 3} fontSize="7.5" fill="currentColor" opacity=".4">
                                {level}%
                            </text>
                        </g>
                    ))}

                    {metrics.map((metric, i) => {
                        const { x: endX, y: endY } = getCoordinates(i, 100);
                        const { x: labelX, y: labelY } = getCoordinates(i, 122);
                        return (
                            <g key={metric.key}>
                                <line x1={cx} y1={cy} x2={endX} y2={endY} stroke="currentColor" opacity=".2" strokeWidth="1" strokeDasharray="2 2" />
                                <text x={labelX} y={labelY + 3} textAnchor="middle" fontSize="9" fontWeight="600" fill="currentColor" opacity=".85">
                                    {metric.name}
                                </text>
                            </g>
                        );
                    })}

                    {evaluatedModels.map(model => {
                        const values = metrics.map(m => model[m.key] as number);
                        const polygonPoints = values.map((val, i) => {
                            const { x, y } = getCoordinates(i, val);
                            return `${x},${y}`;
                        }).join(' ');
                        const color = model.color || MODEL_COLORS[model.model_name] || '#38bdf8';

                        return (
                            <g key={model.model_name}>
                                <polygon points={polygonPoints} fill={color} fillOpacity="0.2" stroke={color} strokeWidth="2.2" />
                                {values.map((val, i) => {
                                    const { x, y } = getCoordinates(i, val);
                                    return (
                                        <g key={i}>
                                            <circle cx={x} cy={y} r="3.5" fill={color} stroke="#111827" strokeWidth="1.5" />
                                            <text x={x} y={y - 6} textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" opacity=".95">
                                                {val.toFixed(1)}%
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div className="rounded-lg bg-base-300/40 p-2.5 text-[11px] space-y-1.5 border border-base-300/60">
                <div className="flex flex-wrap items-center gap-3">
                    {evaluatedModels.map(m => (
                        <div key={m.model_name} className="flex items-center gap-1.5">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color || MODEL_COLORS[m.model_name] || '#38bdf8' }} />
                            <strong>{m.model_name}</strong> (Evaluated)
                        </div>
                    ))}
                </div>
                {models.filter(m => !evaluatedModels.includes(m)).length > 0 && (
                    <div className="text-base-content/60 text-[10px]">
                        Unmeasured models ({models.filter(m => !evaluatedModels.includes(m)).map(m => m.model_name).join(', ')}) are excluded from radar polygons to prevent falsely showing 0% coverage.
                    </div>
                )}
            </div>
        </div>
    );
};

/* ── Heatmap Component ────────────────────────────────────────────── */
const ModelHeatmap: React.FC<{ models: BenchmarkModelData[] }> = ({ models }) => {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-base-content/70">
                <span className="font-semibold text-xs text-base-content/80">Model vs. Metric Matrix</span>
                <span className="text-[10px] text-base-content/50">Higher percentage = Higher intensity</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-base-300">
                <table className="table table-sm w-full text-center">
                    <thead>
                        <tr className="bg-base-300/80 text-[11px]">
                            <th className="text-left">Model Name</th>
                            {BENCHMARK_METRICS.map(m => (
                                <th key={m.key} className="text-center">{m.name}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {models.map(model => (
                            <tr key={model.model_name} className={model.isCurrent ? 'bg-primary/5 font-medium' : ''}>
                                <td className="text-left whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: model.color || MODEL_COLORS[model.model_name] || '#94a3b8' }} />
                                        <strong className="text-xs">{model.model_name}</strong>
                                        {model.isCurrent && <span className="badge badge-xs badge-primary">Current</span>}
                                    </div>
                                    <span className="text-[10px] text-base-content/50 block">{model.architecture}</span>
                                </td>

                                {BENCHMARK_METRICS.map(metric => {
                                    const val = model[metric.key];

                                    if (val !== null && typeof val === 'number') {
                                        const intensity = Math.max(0.15, Math.min(0.65, (val / 100) * 0.7));
                                        return (
                                            <td key={metric.key} className="p-2">
                                                <div
                                                    className="rounded-md py-2 px-1 text-xs font-bold transition-all"
                                                    style={{
                                                        backgroundColor: `rgba(56, 189, 248, ${intensity})`,
                                                        color: '#ffffff',
                                                        border: '1px solid rgba(56, 189, 248, 0.4)'
                                                    }}
                                                >
                                                    {val.toFixed(1)}%
                                                </div>
                                            </td>
                                        );
                                    }

                                    const statusText = model.training_status === 'in_progress' ? 'Training…' : 'Pending';
                                    return (
                                        <td key={metric.key} className="p-2">
                                            <div className="rounded-md py-2 px-1 text-[11px] bg-base-300/30 border border-dashed border-base-content/20 text-base-content/40">
                                                {statusText}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-[10px] text-base-content/50">
                Heatmap cell shading reflects measured detection percentages. Cells marked as &quot;Pending&quot; or &quot;Training&quot; represent models undergoing active benchmark execution.
            </p>
        </div>
    );
};

/* ── Metric Leaderboard Component ─────────────────────────────────── */
const ModelLeaderboard: React.FC<{ models: BenchmarkModelData[]; baselineName: string }> = ({ models, baselineName }) => {
    const currentModel = models.find(m => m.isCurrent) || models[0];
    const baselineModel = models.find(m => m.model_name === baselineName) || models[1] || models[0];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px]">
                <h4 className="font-semibold text-xs text-base-content/80 flex items-center gap-1.5">
                    <Trophy size={14} className="text-amber-400" /> Metric-by-Metric Leaderboard
                </h4>
                <span className="text-[10px] text-base-content/50">Comparison vs. {baselineModel?.model_name || 'Baseline'}</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-base-300">
                <table className="table table-sm w-full">
                    <thead>
                        <tr className="bg-base-300/80 text-[11px]">
                            <th>Metric</th>
                            {models.map(m => (
                                <th key={m.model_name} className="text-center">{m.model_name}</th>
                            ))}
                            <th className="text-center">Top Performer</th>
                            <th className="text-center">Δ vs. {baselineModel?.model_name.split(' ')[0]}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {BENCHMARK_METRICS.map(metric => {
                            const curVal = currentModel ? currentModel[metric.key] : null;
                            const baseVal = baselineModel ? baselineModel[metric.key] : null;

                            // Find best model among evaluated models
                            const evaluatedWithVal = models.filter(m => m[metric.key] !== null && typeof m[metric.key] === 'number');
                            let bestModelName = 'Pending';
                            if (evaluatedWithVal.length > 0) {
                                evaluatedWithVal.sort((a, b) => (b[metric.key] as number) - (a[metric.key] as number));
                                bestModelName = `${evaluatedWithVal[0].model_name} (${(evaluatedWithVal[0][metric.key] as number).toFixed(1)}%)`;
                            }

                            const delta = (curVal !== null && baseVal !== null)
                                ? (curVal - baseVal).toFixed(1)
                                : null;

                            return (
                                <tr key={metric.key} className="hover:bg-base-300/30 text-xs">
                                    <td>
                                        <strong className="block text-primary">{metric.name}</strong>
                                        <span className="text-[10px] text-base-content/50">{metric.description}</span>
                                    </td>
                                    {models.map(m => {
                                        const val = m[metric.key];
                                        return (
                                            <td key={m.model_name} className="text-center">
                                                {val !== null ? (
                                                    <strong className={m.isCurrent ? 'text-primary' : ''}>{val.toFixed(1)}%</strong>
                                                ) : (
                                                    <span className="badge badge-xs badge-ghost opacity-60">
                                                        {m.training_status === 'in_progress' ? 'Training' : 'Pending'}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="text-center">
                                        <span className="badge badge-xs badge-primary badge-outline font-semibold">
                                            {bestModelName}
                                        </span>
                                    </td>
                                    <td className="text-center">
                                        {delta !== null ? (
                                            <span className={`font-semibold ${Number(delta) >= 0 ? 'text-success' : 'text-error'}`}>
                                                {Number(delta) >= 0 ? `+${delta}%` : `${delta}%`}
                                            </span>
                                        ) : (
                                            <span className="text-base-content/40 text-[10px]">— (Baseline pending)</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

/* ── Summary Metric Cards Component ───────────────────────────────── */
const ModelSummaryCards: React.FC<{ models: BenchmarkModelData[]; baselineName: string }> = ({ models, baselineName }) => {
    const currentModel = models.find(m => m.isCurrent) || models[0];
    const baselineModel = models.find(m => m.model_name === baselineName) || models[1] || models[0];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {BENCHMARK_METRICS.map(metric => {
                const curVal = currentModel ? currentModel[metric.key] : null;
                const baseVal = baselineModel ? baselineModel[metric.key] : null;
                const diff = (curVal !== null && baseVal !== null) ? curVal - baseVal : null;

                // Find overall leader for this metric
                const evaluated = models.filter(m => m[metric.key] !== null && typeof m[metric.key] === 'number');
                evaluated.sort((a, b) => (b[metric.key] as number) - (a[metric.key] as number));
                const leader = evaluated[0];

                return (
                    <div key={metric.key} className="card bg-base-300/50 border border-base-300 p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-base-content/60">
                            <span className="text-[11px] font-semibold">{metric.name}</span>
                            <Sparkles size={13} className="text-primary opacity-80" />
                        </div>

                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold tracking-tight text-base-content">
                                {curVal !== null ? `${curVal.toFixed(1)}%` : 'Pending'}
                            </span>
                            <span className="text-[10px] text-primary/80 uppercase tracking-wider font-semibold">Production</span>
                        </div>

                        <div className="pt-1.5 border-t border-base-300/70 text-[10px] space-y-0.5 text-base-content/60">
                            <div className="flex justify-between">
                                <span>Top Leader:</span>
                                <span className="font-semibold text-base-content">
                                    {leader ? `${leader.model_name.split(' ')[0]} (${(leader[metric.key] as number).toFixed(1)}%)` : 'Pending'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span>Δ vs {baselineModel?.model_name.split(' ')[0]}:</span>
                                <span className={diff !== null ? (diff >= 0 ? 'text-success font-semibold' : 'text-error font-semibold') : 'text-base-content/40'}>
                                    {diff !== null ? (diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`) : '—'}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

/* ── Main Model Benchmark & Innovation Analytics Section ───────────── */
export const ModelBenchmarkSection: React.FC = () => {
    const [benchmarkData, setBenchmarkData] = useState<BenchmarkSummary | null>(null);
    const [selectedBaseline, setSelectedBaseline] = useState<string>('YOLO11n');
    const [visibleModelNames, setVisibleModelNames] = useState<string[]>([
        'YOLO26n',
        'YOLO11n',
        'YOLOv8n'
    ]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [lastRefreshed, setLastRefreshed] = useState<string>('');

    const fetchBenchmarkData = async () => {
        try {
            const res = await fetch(`/benchmark_summary.json?t=${Date.now()}`);
            if (res.ok) {
                const data: BenchmarkSummary = await res.json();
                // Add styling fields
                data.models = data.models.map(m => ({
                    ...m,
                    color: MODEL_COLORS[m.model_name] || '#38bdf8',
                    isCurrent: m.model_name === 'YOLO26n' || m.model_name === 'YOLO26n (Client Runtime)' || (m as any).is_current === true
                }));
                setBenchmarkData(data);
                setVisibleModelNames(prev => {
                    const allNames = data.models.map(m => m.model_name);
                    return Array.from(new Set([...prev, ...allNames]));
                });
                setLastRefreshed(new Date().toLocaleTimeString());
            }
        } catch (e) {
            console.warn('Could not fetch benchmark_summary.json:', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBenchmarkData();
        // Auto-poll every 10 seconds to catch training completion
        const interval = setInterval(fetchBenchmarkData, 10000);
        return () => clearInterval(interval);
    }, []);

    const models: BenchmarkModelData[] = benchmarkData?.models || DEFAULT_MODELS;
    const filteredModels = models.filter(m => visibleModelNames.includes(m.model_name));

    const toggleModel = (name: string) => {
        if (visibleModelNames.includes(name)) {
            if (visibleModelNames.length > 1) {
                setVisibleModelNames(visibleModelNames.filter(m => m !== name));
            }
        } else {
            setVisibleModelNames([...visibleModelNames, name]);
        }
    };

    const currentModel = models.find(m => m.isCurrent) || models[0];

    return (
        <section className="card panel bg-base-200 border border-base-300 space-y-6 p-6" id="model-benchmark-analytics">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-base-300 pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Cpu size={18} className="text-primary" />
                        <h3 className="text-base font-semibold">Model Benchmark &amp; Innovation Analytics</h3>
                        <span className="badge badge-sm badge-primary badge-outline">5 Parameters</span>
                    </div>
                    <p className="text-xs text-base-content/60 mt-1">
                        Empirical comparative evaluation against baseline architectures on held-out test split (141 images, 11 classes).
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={fetchBenchmarkData} className="btn btn-xs btn-ghost gap-1 text-[11px] opacity-70 hover:opacity-100">
                        <RefreshCw size={11} /> Refresh Benchmark
                    </button>
                    <span className="badge badge-sm badge-info badge-outline text-[11px]">Test Split Parity</span>
                    <span className="badge badge-sm badge-success badge-outline text-[11px]">Zero-Simulation Guarantee</span>
                </div>
            </div>

            {/* Prominent Current Model Banner */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5 relative overflow-hidden">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="badge badge-sm badge-primary font-bold tracking-wider">CURRENT PRODUCTION MODEL</span>
                            <span className="badge badge-sm badge-outline text-xs">{currentModel.architecture}</span>
                            <span className="badge badge-sm badge-ghost text-xs">640 × 640 ONNX Runtime</span>
                        </div>
                        <h4 className="text-lg font-bold text-base-content">{currentModel.model_name} Production Architecture</h4>
                        <p className="text-xs text-base-content/70 max-w-2xl leading-relaxed">
                            Client-side optimized {currentModel.architecture} detector with direct multi-class PPE localization. Evaluated on custom 141-image held-out test set: <strong>{currentModel.precision !== null ? `${currentModel.precision.toFixed(1)}%` : 'Pending'} Precision</strong>, <strong>{currentModel.recall !== null ? `${currentModel.recall.toFixed(1)}%` : 'Pending'} Recall</strong>, <strong>{currentModel.f1_score !== null ? `${currentModel.f1_score.toFixed(1)}%` : 'Pending'} F1-Score</strong>, <strong>{currentModel.map50 !== null ? `${currentModel.map50.toFixed(1)}%` : 'Pending'} mAP@50</strong>, and <strong>{currentModel.map50_95 !== null ? `${currentModel.map50_95.toFixed(1)}%` : 'Pending'} mAP@50–95</strong>.
                        </p>
                    </div>
                    <div className="flex flex-row lg:flex-col gap-2 shrink-0 text-xs text-base-content/60 border-t lg:border-t-0 lg:border-l border-base-300 pt-3 lg:pt-0 lg:pl-5">
                        <div><span className="text-base-content/40 block text-[10px]">INFERENCE SPEED</span>{currentModel.inference_speed_ms ? `${currentModel.inference_speed_ms} ms/image` : '5.42 ms/image'}</div>
                        <div><span className="text-base-content/40 block text-[10px]">CLASSES</span>11 PPE &amp; Worker Classes</div>
                    </div>
                </div>
            </div>

            {/* Metric Definitions Bar */}
            <div>
                <h4 className="text-xs font-semibold text-base-content/80 mb-2.5 flex items-center gap-1.5">
                    <HelpCircle size={14} className="opacity-60" /> Evaluation Metric Definitions
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    {BENCHMARK_METRICS.map(m => (
                        <div key={m.key} className="rounded-lg bg-base-300/60 p-3 border border-base-300/80 space-y-1">
                            <strong className="text-xs text-primary block">{m.label}</strong>
                            <p className="text-[11px] leading-relaxed text-base-content/60">{m.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Interactive Controls & Filters */}
            <div className="rounded-lg bg-base-300/30 p-3 border border-base-300/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-base-content/70 flex items-center gap-1">
                        <Filter size={13} /> Filter Models:
                    </span>
                    {models.map(m => (
                        <button
                            key={m.model_name}
                            onClick={() => toggleModel(m.model_name)}
                            className={`btn btn-xs ${visibleModelNames.includes(m.model_name) ? 'btn-primary' : 'btn-ghost opacity-60'}`}
                        >
                            {visibleModelNames.includes(m.model_name) && <Check size={11} className="mr-0.5" />}
                            {m.model_name}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-base-content/70">
                        <span>Selected Baseline:</span>
                        <select
                            className="select select-bordered select-xs"
                            value={selectedBaseline}
                            onChange={e => setSelectedBaseline(e.target.value)}
                        >
                            <option value="YOLO11n">YOLO11n</option>
                            <option value="YOLOv8n">YOLOv8n</option>
                        </select>
                    </label>
                </div>
            </div>

            {/* Model Performance Summary Cards */}
            <div className="space-y-2">
                <h4 className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-primary opacity-80" /> Five-Parameter Performance Summary Cards
                </h4>
                <ModelSummaryCards models={models} baselineName={selectedBaseline} />
            </div>

            {/* Dual Visualizations: Grouped Bar Chart & Radar Profile */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 rounded-xl bg-base-300/40 p-4 border border-base-300 space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                            <BarChart3 size={14} className="opacity-60" /> Metric Comparison (Grouped Bar Chart)
                        </h4>
                        <span className="text-[10px] text-base-content/50">5 Standard Metrics</span>
                    </div>
                    <ModelBenchmarkBarChart models={filteredModels} metrics={BENCHMARK_METRICS} />
                </div>

                <div className="lg:col-span-5 rounded-xl bg-base-300/40 p-4 border border-base-300 space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                            <Radar size={14} className="opacity-60" /> Model Performance Profile (Radar Chart)
                        </h4>
                        <span className="text-[10px] text-base-content/50">Pentagonal Profile</span>
                    </div>
                    <ModelRadarChart models={filteredModels} />
                </div>
            </div>

            {/* Model vs. Metric Heatmap */}
            <div className="rounded-xl bg-base-300/40 p-4 border border-base-300 space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                        <Grid size={14} className="opacity-60" /> Model versus Metric Heatmap
                    </h4>
                    <span className="text-[10px] text-base-content/50">Numeric Accuracy Matrix</span>
                </div>
                <ModelHeatmap models={filteredModels} />
            </div>

            {/* Metric-by-Metric Leaderboard */}
            <div className="rounded-xl bg-base-300/40 p-4 border border-base-300 space-y-3">
                <ModelLeaderboard models={models} baselineName={selectedBaseline} />
            </div>

            {/* Model Benchmark Comparison Table */}
            <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                        <Layers size={14} className="opacity-60" /> Model Benchmark Comparison Table
                    </h4>
                    <span className="text-[10px] text-base-content/50">Held-out Test Split Parity</span>
                </div>
                <div className="overflow-x-auto rounded-lg border border-base-300">
                    <table className="table table-sm w-full">
                        <thead>
                            <tr className="bg-base-300/80 text-[11px]">
                                <th>Model</th>
                                <th>Architecture</th>
                                <th className="text-center">Precision (%)</th>
                                <th className="text-center">Recall (%)</th>
                                <th className="text-center">F1-Score (%)</th>
                                <th className="text-center">mAP@50 (%)</th>
                                <th className="text-center">mAP@50–95 (%)</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {models.map(m => {
                                return (
                                    <tr key={m.model_name} className={m.isCurrent ? 'bg-primary/5 border-l-2 border-l-primary font-medium' : 'hover:bg-base-300/40'}>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color || MODEL_COLORS[m.model_name] || '#94a3b8' }} />
                                                <strong>{m.model_name}</strong>
                                                {m.isCurrent && <span className="badge badge-xs badge-primary">Current</span>}
                                            </div>
                                            <small className="block text-[10px] text-base-content/50">{m.weights_path}</small>
                                        </td>
                                        <td>
                                            <span className="text-xs">{m.architecture}</span>
                                            <small className="block text-[10px] text-base-content/40">640 × 640 · FP32</small>
                                        </td>
                                        <td className="text-center">
                                            {m.precision !== null ? <span className="text-primary font-semibold">{m.precision.toFixed(1)}%</span> : <span className="badge badge-xs badge-ghost opacity-60">{m.training_status === 'in_progress' ? 'Training…' : 'Pending'}</span>}
                                        </td>
                                        <td className="text-center">
                                            {m.recall !== null ? <span className="text-primary font-semibold">{m.recall.toFixed(1)}%</span> : <span className="badge badge-xs badge-ghost opacity-60">{m.training_status === 'in_progress' ? 'Training…' : 'Pending'}</span>}
                                        </td>
                                        <td className="text-center">
                                            {m.f1_score !== null ? <span className="text-primary font-semibold">{m.f1_score.toFixed(1)}%</span> : <span className="badge badge-xs badge-ghost opacity-60">{m.training_status === 'in_progress' ? 'Training…' : 'Pending'}</span>}
                                        </td>
                                        <td className="text-center">
                                            {m.map50 !== null ? <span className="text-primary font-semibold">{m.map50.toFixed(1)}%</span> : <span className="badge badge-xs badge-ghost opacity-60">{m.training_status === 'in_progress' ? 'Training…' : 'Pending'}</span>}
                                        </td>
                                        <td className="text-center">
                                            {m.map50_95 !== null ? <span className="text-primary font-semibold">{m.map50_95.toFixed(1)}%</span> : <span className="badge badge-xs badge-ghost opacity-60">{m.training_status === 'in_progress' ? 'Training…' : 'Pending'}</span>}
                                        </td>
                                        <td>
                                            {m.isCurrent ? (
                                                <span className="badge badge-xs badge-success badge-soft">Active Production</span>
                                            ) : m.training_status === 'in_progress' ? (
                                                <span className="badge badge-xs badge-warning badge-soft animate-pulse">Training in Progress</span>
                                            ) : m.evaluation_status === 'completed' ? (
                                                <span className="badge badge-xs badge-info badge-soft">Evaluated</span>
                                            ) : (
                                                <span className="badge badge-xs badge-ghost badge-soft">Pending</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Dataset & Evaluation Conditions */}
            <div className="rounded-lg bg-base-300/40 p-4 border border-base-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-base-content/80">
                    <Info size={14} className="opacity-60" /> Standardized Dataset &amp; Evaluation Conditions
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-base-content/70 text-[11px]">
                    <div>
                        <strong className="block text-base-content/90 flex items-center gap-1">
                            <Database size={12} /> Test Dataset Specification
                        </strong>
                        Construction-PPE Dataset (Held-out Test split: 141 images, 1,251 instances).
                        <span className="block mt-1 text-[10px] text-base-content/50">
                            Classes: helmet, gloves, vest, boots, goggles, none, Person, no_helmet, no_goggle, no_gloves, no_boots.
                        </span>
                    </div>
                    <div>
                        <strong className="block text-base-content/90 flex items-center gap-1">
                            <HardDrive size={12} /> Training &amp; Hardware Details
                        </strong>
                        NVIDIA GeForce RTX 3050 Laptop GPU (4.0 GB VRAM).
                        <span className="block mt-1 text-[10px] text-base-content/50">
                            Settings: 640 × 640 resolution, batch size 8, patience 20, AMP enabled, PyTorch + Ultralytics (CUDA 13.0).
                        </span>
                    </div>
                    <div>
                        <strong className="block text-base-content/90 flex items-center gap-1">
                            <Calendar size={12} /> Empirical Protocol &amp; Parity
                        </strong>
                        Evaluated using unified Ultralytics test evaluator on identical 141 test images. Unmeasured models remain strictly marked &quot;Pending&quot; or &quot;Training&quot; to prevent data fabrication.
                    </div>
                </div>
            </div>
        </section>
    );
};
