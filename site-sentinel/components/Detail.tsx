import React, { useState, useRef } from 'react';
import {
    X,
    Image as ImageIcon,
    CheckCircle,
    ArrowRight,
    Upload,
    Camera,
    ShieldCheck,
    AlertCircle,
    AlertTriangle,
    RotateCcw,
    Check,
    Clock,
    UserCheck,
    FileImage
} from 'lucide-react';
import {
    Inspection,
    Site,
    Analysis,
    risk,
    riskClass,
    readImage,
    Status,
    scoreFor,
    Role
} from '../types';
import { DetectionEvidence } from './DetectionEvidence';
import { analyzeImage, resetModelState } from '../inference/client';
import { supabase } from '../lib/supabase';

export interface DetailProps {
    item: Inspection;
    sites: Site[];
    close: () => void;
    save: (i: Inspection) => void;
    userEmail?: string;
    role?: Role;
}

export const Detail: React.FC<DetailProps> = ({
    item,
    sites,
    close,
    save,
    userEmail,
    role
}) => {
    // Basic assignment state
    const [owner, setOwner] = useState(item.owner);
    const [due, setDue] = useState(item.due);
    const [notes, setNotes] = useState(item.notes);

    // After-correction verification state
    const [followupImage, setFollowupImage] = useState<string>(item.followup || '');
    const [verification, setVerification] = useState<Analysis | undefined>(item.verificationAnalysis);
    const [verificationScore, setVerificationScore] = useState<number | undefined>(item.verificationScore);
    const [verificationStatus, setVerificationStatus] = useState<'pending' | 'rejected' | 'approved' | undefined>(
        item.verificationStatus || (item.status === 'Resolved' && item.followup ? 'approved' : undefined)
    );

    // File selection & upload state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [processingStep, setProcessingStep] = useState<string>('');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [successMessage, setSuccessMessage] = useState<string>('');
    const [isDragging, setIsDragging] = useState<boolean>(false);

    // Ref for file inputs
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    // Authorization & closure checks
    const isOfficer = role === 'safety_officer' || role === 'admin';
    const isReporter = role === 'reporter';
    const isClosed = ['Resolved', 'Compliant'].includes(item.status);

    const siteName = sites.find(s => s.id === item.site)?.name || item.site;
    const formattedCreatedDate = item.created
        ? new Date(item.created).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : 'N/A';

    // Update assignment details
    function handleUpdateAssignment(status: Status, logText: string) {
        save({
            ...item,
            owner,
            due,
            notes,
            followup: followupImage,
            verificationAnalysis: verification,
            verificationScore,
            verificationStatus,
            status,
            history: [
                ...item.history,
                { time: new Date().toISOString(), text: logText }
            ]
        });
    }

    // Handle file selection & validation
    function handleFileSelection(file: File | undefined) {
        setErrorMessage('');
        setSuccessMessage('');

        if (!file) {
            setErrorMessage('No image was selected. Please choose a valid image file.');
            return;
        }

        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            setErrorMessage('Unsupported file type. Please upload a JPG, PNG, or WebP image.');
            return;
        }

        const maxSize = 8 * 1024 * 1024; // 8 MB
        if (file.size > maxSize) {
            setErrorMessage(`File exceeds 8 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select a smaller image.`);
            return;
        }

        setSelectedFile(file);
        const objUrl = URL.createObjectURL(file);
        setPreviewUrl(objUrl);
    }

    // Drag-and-drop events
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        handleFileSelection(file);
    };

    // Clear selected file
    const handleClearSelected = () => {
        setSelectedFile(null);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl('');
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        setErrorMessage('');
    };

    // Trigger file chooser
    const handleBrowseClick = () => {
        fileInputRef.current?.click();
    };

    // Trigger camera capture
    const handleCameraClick = () => {
        cameraInputRef.current?.click();
    };

    // Main Upload & Verification Pipeline
    async function handleUploadAndVerify() {
        if (!selectedFile) {
            setErrorMessage('No image selected. Please choose or capture an after-correction image first.');
            return;
        }

        if (isReporter) {
            setErrorMessage('Unauthorized: Only Safety Officers can submit after-correction verification.');
            return;
        }

        setIsProcessing(true);
        setErrorMessage('');
        setSuccessMessage('');
        resetModelState();

        try {
            // STEP 5.1: Process and optimize image
            setProcessingStep('Preparing after-correction image for upload and inference…');
            const optimizedBase64 = await readImage(selectedFile);

            // Attempt storage upload using Supabase Storage
            let finalImageUrl = optimizedBase64;
            setProcessingStep('Uploading image to secure storage architecture…');
            try {
                const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
                const timestamp = Date.now();
                const storagePath = `followup/${userEmail || 'officer'}/${item.id}_${timestamp}.${ext}`;

                const { data: uploadData, error: uploadErr } = await supabase.storage
                    .from('inspections')
                    .upload(storagePath, selectedFile, {
                        contentType: selectedFile.type,
                        upsert: true
                    });

                if (!uploadErr && uploadData) {
                    const { data: publicUrlData } = supabase.storage
                        .from('inspections')
                        .getPublicUrl(storagePath);
                    if (publicUrlData?.publicUrl) {
                        finalImageUrl = publicUrlData.publicUrl;
                    }
                }
            } catch (storageErr) {
                console.warn('Storage upload fallback (optimized local URI used):', storageErr);
            }

            // STEP 5.2 & 5.3 & 5.4: Run production YOLO model
            setProcessingStep('Running production YOLO PPE detection model on follow-up image…');
            const analysisResult = await analyzeImage(optimizedBase64);

            // STEP 5.5: Compute after-correction risk score
            setProcessingStep('Evaluating compliance results and calculating after-correction risk score…');
            const newHelmets = analysisResult.missingHelmets;
            const newVests = analysisResult.missingVests;
            const newPersons = analysisResult.persons;

            // Existing scoring logic:
            // If zero violations detected, score is strictly 0.
            // If violations detected, apply standard explainable weights:
            // helmets: 50 each, vests: 15 each, multiple: +10, repeat: +10, critical: +25
            let calculatedScore = 0;
            if (newHelmets > 0 || newVests > 0) {
                const isMultiple = (newHelmets + newVests) > 1;
                calculatedScore = scoreFor(newHelmets, newVests, isMultiple, item.repeat, item.critical);
            }

            // Update UI state
            setFollowupImage(finalImageUrl);
            setVerification(analysisResult);
            setVerificationScore(calculatedScore);

            const timestamp = new Date().toISOString();
            const officerIdentifier = userEmail || owner || 'Safety Officer';

            // STEP 6: VERIFY AND CLOSE RULE
            // Strictly below 15 closes the report
            if (calculatedScore < 15) {
                // Success: strictly below 15!
                setVerificationStatus('approved');
                const successNotice = 'Verification successful. Corrective action closed.';
                setSuccessMessage(successNotice);

                const historyLog = `After-correction verification PASSED by ${officerIdentifier}. Real YOLO evaluation confirmed compliance (${newPersons} person(s), 0 missing helmets, 0 missing vests). After-correction risk score: ${calculatedScore}/100 (< 15 threshold). Action marked Resolved.`;

                const updatedInspection: Inspection = {
                    ...item,
                    owner,
                    due,
                    notes,
                    followup: finalImageUrl,
                    verificationAnalysis: analysisResult,
                    verificationScore: calculatedScore,
                    verificationStatus: 'approved',
                    verifiedBy: officerIdentifier,
                    verifiedAt: timestamp,
                    status: 'Resolved',
                    history: [
                        ...item.history,
                        { time: timestamp, text: historyLog }
                    ]
                };

                save(updatedInspection);
                handleClearSelected();
            } else {
                // Failure: 15 or above requires further action!
                setVerificationStatus('rejected');
                const alertNotice = `Further corrective action required. YOLO detected remaining PPE violations (Risk score: ${calculatedScore}/100 ≥ 15). Detected: ${newHelmets} missing helmet(s), ${newVests} missing vest(s). Report remains open.`;
                setErrorMessage(alertNotice);

                const historyLog = `After-correction verification ATTEMPT by ${officerIdentifier}. Remaining violations detected (${newHelmets} missing helmet(s), ${newVests} missing vest(s)). After-correction risk score: ${calculatedScore}/100 (Threshold < 15 required). Action remains in progress.`;

                const updatedInspection: Inspection = {
                    ...item,
                    owner,
                    due,
                    notes,
                    followup: finalImageUrl,
                    verificationAnalysis: analysisResult,
                    verificationScore: calculatedScore,
                    verificationStatus: 'rejected',
                    verifiedBy: officerIdentifier,
                    verifiedAt: timestamp,
                    status: 'In progress',
                    history: [
                        ...item.history,
                        { time: timestamp, text: historyLog }
                    ]
                };

                save(updatedInspection);
            }
        } catch (err: any) {
            console.error('After-correction verification failed:', err);
            const msg = (err instanceof Error ? err.message : String(err)) || 'Inference or upload failure. Please retry.';
            setErrorMessage(`Verification process failed: ${msg}. The corrective action has not been closed. Please retry.`);
        } finally {
            setIsProcessing(false);
            setProcessingStep('');
        }
    }

    return (
        <div className="modal modal-open" role="dialog" aria-modal="true" aria-label="Inspection detail">
            <div className="modal-box bg-base-100 max-w-4xl max-h-[92vh] overflow-y-auto">
                {/* Modal Header */}
                <div className="modal-title flex items-start justify-between border-b border-base-300 pb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="eyebrow text-primary font-bold">{item.id}</span>
                            <span className="badge badge-xs badge-outline">
                                {item.demo ? 'SAMPLE RECORD' : item.source === 'yolo' ? 'YOLO26n DETECTION' : 'MANUAL REVIEW'}
                            </span>
                        </div>
                        <h2 className="text-xl font-bold mt-0.5">{item.zone}</h2>
                        <p className="text-xs text-base-content/60">
                            {siteName} · Submitted on {formattedCreatedDate}
                        </p>
                    </div>
                    <button aria-label="Close" className="btn btn-ghost btn-sm btn-circle" onClick={close}>
                        <X size={18} />
                    </button>
                </div>

                <div className="section-stack space-y-6 pt-4">
                    {/* Status & Original Risk Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`badge ${riskClass(item.score)} font-semibold`}>
                            Original Risk: {item.score}/100 · {item.status === 'Needs review' ? 'Review required' : risk(item.score)}
                        </span>
                        <span className="badge badge-outline font-semibold">
                            Status: {item.status}
                        </span>
                        {item.verificationStatus === 'approved' && (
                            <span className="badge badge-success gap-1 text-xs">
                                <CheckCircle size={12} /> Verified &amp; Closed
                            </span>
                        )}
                        {item.verificationStatus === 'rejected' && (
                            <span className="badge badge-error gap-1 text-xs">
                                <AlertTriangle size={12} /> Further Correction Required
                            </span>
                        )}
                    </div>

                    {/* Step 1 & 2: Original Violation Overview Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Original Evidence Card */}
                        <div className="card bg-base-200 border border-base-300 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-base-content uppercase tracking-wider flex items-center gap-1.5">
                                    <FileImage size={14} className="text-primary" /> Original Evidence (Violation)
                                </h3>
                                <span className="text-[11px] text-base-content/50">Report {item.id}</span>
                            </div>
                            {item.image ? (
                                item.analysis ? (
                                    <DetectionEvidence image={item.image} analysis={item.analysis} compact />
                                ) : (
                                    <img className="evidence-img rounded-lg w-full max-h-56 object-cover" src={item.image} alt="Original site evidence" />
                                )
                            ) : (
                                <div className="empty p-8 text-center text-base-content/40 bg-base-300/40 rounded-lg">
                                    <ImageIcon className="mx-auto mb-2 opacity-50" size={28} />
                                    <small className="block">No original image attached (Sample record)</small>
                                </div>
                            )}
                        </div>

                        {/* Original Risk Breakdown Card */}
                        <div className="card bg-base-200 border border-base-300 p-4 space-y-2 text-xs">
                            <h3 className="font-bold text-base-content uppercase tracking-wider text-xs">
                                Original Violation Details
                            </h3>
                            <div className="space-y-1.5 pt-1 text-base-content/80">
                                <p className="flex justify-between">
                                    <span>Missing helmets detected:</span>
                                    <strong className={item.helmets > 0 ? 'text-error' : ''}>{item.helmets} (+{item.helmets * 50} pts)</strong>
                                </p>
                                <p className="flex justify-between">
                                    <span>Missing safety vests detected:</span>
                                    <strong className={item.vests > 0 ? 'text-error' : ''}>{item.vests} (+{item.vests * 15} pts)</strong>
                                </p>
                                {item.multiple && (
                                    <p className="flex justify-between text-warning">
                                        <span>Multiple PPE violations:</span>
                                        <strong>+10 pts</strong>
                                    </p>
                                )}
                                {item.repeat && (
                                    <p className="flex justify-between text-warning">
                                        <span>Repeated violation (30-day zone history):</span>
                                        <strong>+10 pts</strong>
                                    </p>
                                )}
                                {item.critical && (
                                    <p className="flex justify-between text-error font-semibold">
                                        <span>Critical site-rule violation:</span>
                                        <strong>+25 pts</strong>
                                    </p>
                                )}
                            </div>
                            <div className="border-t border-base-300 pt-2 text-[11px] text-base-content/50">
                                Submitted: {formattedCreatedDate}
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Assignment & Action Details */}
                    <div className="card bg-base-200 border border-base-300 p-4 space-y-3">
                        <h3 className="text-xs font-bold text-base-content uppercase tracking-wider">
                            Corrective Action Management
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <label className="field">
                                <span className="font-semibold block mb-1">Assigned Supervisor / Owner</span>
                                <input
                                    className="input input-bordered input-sm w-full"
                                    value={owner}
                                    disabled={isClosed}
                                    placeholder="Supervisor name"
                                    onChange={e => setOwner(e.target.value)}
                                />
                            </label>
                            <label className="field">
                                <span className="font-semibold block mb-1">Target Due Date</span>
                                <input
                                    className="input input-bordered input-sm w-full"
                                    type="date"
                                    value={due}
                                    disabled={isClosed}
                                    onChange={e => setDue(e.target.value)}
                                />
                            </label>
                            <label className="field sm:col-span-2">
                                <span className="font-semibold block mb-1">Corrective Action Notes</span>
                                <textarea
                                    className="textarea textarea-bordered textarea-sm w-full"
                                    rows={2}
                                    value={notes}
                                    disabled={isClosed}
                                    placeholder="Describe corrective actions taken on site…"
                                    onChange={e => setNotes(e.target.value)}
                                />
                            </label>
                        </div>

                        {!isClosed && isOfficer && (
                            <div className="flex gap-2 flex-wrap pt-1">
                                <button
                                    type="button"
                                    className="btn btn-xs btn-outline"
                                    onClick={() => handleUpdateAssignment(item.status, 'Assignment details / action notes saved.')}
                                >
                                    Save details
                                </button>
                                {item.status === 'Open' && (
                                    <button
                                        type="button"
                                        className="btn btn-xs btn-primary gap-1"
                                        disabled={!owner.trim()}
                                        onClick={() => handleUpdateAssignment('In progress', `Corrective action initiated by ${owner || userEmail}.`)}
                                    >
                                        Start corrective action <ArrowRight size={12} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* STEP 4, 5, 6: AFTER-CORRECTION VERIFICATION COMPONENT */}
                    <div className="card bg-base-200 border-2 border-primary/40 p-5 space-y-4" id="after-correction-verification-section">
                        {/* Section Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-300 pb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="text-primary" size={20} />
                                    <h3 className="text-sm font-bold tracking-wide">After-Correction Verification</h3>
                                </div>
                                <p className="text-xs text-base-content/60 mt-0.5">
                                    Upload new photographic proof showing the corrected PPE condition. Evaluated via production YOLO model.
                                </p>
                            </div>

                            {/* Verification Status Pill */}
                            <div>
                                {isClosed || verificationStatus === 'approved' ? (
                                    <span className="badge badge-success gap-1.5 py-3 px-3 text-xs font-bold">
                                        <CheckCircle size={14} /> Verified and Closed
                                    </span>
                                ) : verificationStatus === 'rejected' ? (
                                    <span className="badge badge-error gap-1.5 py-3 px-3 text-xs font-bold">
                                        <AlertTriangle size={14} /> Further Correction Required
                                    </span>
                                ) : (
                                    <span className="badge badge-warning badge-outline gap-1.5 py-3 px-3 text-xs font-semibold">
                                        <Clock size={14} /> Verification Pending
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Closure Rule Banner */}
                        <div className="bg-base-300/60 rounded-lg p-3 text-xs flex items-start gap-2.5 text-base-content/75">
                            <AlertCircle size={16} className="text-primary shrink-0 mt-0.5" />
                            <div>
                                <strong>Automated Zero-Simulation Verification Rule:</strong>
                                <span className="block mt-0.5">
                                    If the after-correction risk score is <strong>strictly below 15</strong>, verification succeeds and the report closes automatically. If the score is <strong>15 or above</strong> (e.g. any missing vest or helmet remains), the report stays open for further correction.
                                </span>
                            </div>
                        </div>

                        {/* Existing After-Correction Evidence (if already verified or previously submitted) */}
                        {followupImage && (
                            <div className="rounded-xl bg-base-100 border border-base-300 p-4 space-y-3">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <strong className="text-xs flex items-center gap-1.5 text-base-content">
                                        <Check size={14} className="text-success" /> Submitted After-Correction Evidence
                                    </strong>
                                    {verificationScore !== undefined && (
                                        <span className={`badge badge-sm font-bold ${verificationScore < 15 ? 'badge-success' : 'badge-error'}`}>
                                            After-Correction Risk: {verificationScore}/100 {verificationScore < 15 ? '(Passing < 15)' : '(Failed ≥ 15)'}
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                                    <div>
                                        {verification ? (
                                            <DetectionEvidence image={followupImage} analysis={verification} compact />
                                        ) : (
                                            <img className="rounded-lg max-h-56 w-full object-cover border border-base-300" src={followupImage} alt="Follow-up evidence" />
                                        )}
                                    </div>
                                    <div className="text-xs space-y-2 bg-base-200/60 p-3 rounded-lg border border-base-300">
                                        <h4 className="font-bold text-xs uppercase tracking-wider text-base-content/80">YOLO Evaluation Results</h4>
                                        {verification ? (
                                            <div className="space-y-1">
                                                <p className="flex justify-between">
                                                    <span>Workers detected:</span>
                                                    <strong>{verification.persons}</strong>
                                                </p>
                                                <p className="flex justify-between">
                                                    <span>Missing helmets:</span>
                                                    <strong className={verification.missingHelmets > 0 ? 'text-error font-bold' : 'text-success'}>
                                                        {verification.missingHelmets}
                                                    </strong>
                                                </p>
                                                <p className="flex justify-between">
                                                    <span>Missing safety vests:</span>
                                                    <strong className={verification.missingVests > 0 ? 'text-error font-bold' : 'text-success'}>
                                                        {verification.missingVests}
                                                    </strong>
                                                </p>
                                                <p className="flex justify-between text-base-content/50 text-[11px] pt-1 border-t border-base-300">
                                                    <span>Inference runtime:</span>
                                                    <span>{verification.elapsedMs} ms ({verification.model})</span>
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-base-content/50">Analysis record loaded.</p>
                                        )}

                                        {item.verifiedBy && (
                                            <p className="text-[11px] text-base-content/60 pt-1 flex items-center gap-1">
                                                <UserCheck size={12} /> Verified by: <strong>{item.verifiedBy}</strong>
                                                {item.verifiedAt && ` on ${new Date(item.verifiedAt).toLocaleDateString()}`}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Interactive Upload Component (For Safety Officers when report is active or re-verification is desired) */}
                        {isOfficer && (
                            <div className="space-y-4 pt-1">
                                {/* Success Notification */}
                                {successMessage && (
                                    <div className="alert alert-success py-2.5 px-4 text-xs font-semibold flex items-center gap-2">
                                        <CheckCircle size={16} className="shrink-0" />
                                        <span>{successMessage}</span>
                                    </div>
                                )}

                                {/* Error / Warning Notification */}
                                {errorMessage && (
                                    <div className="alert alert-error py-2.5 px-4 text-xs font-semibold flex items-center gap-2">
                                        <AlertTriangle size={16} className="shrink-0" />
                                        <span>{errorMessage}</span>
                                    </div>
                                )}

                                {/* Hidden file inputs */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    disabled={isProcessing}
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        handleFileSelection(file);
                                    }}
                                />
                                <input
                                    ref={cameraInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    disabled={isProcessing}
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        handleFileSelection(file);
                                    }}
                                />

                                {/* Drag-and-Drop Area OR Image Preview */}
                                {!previewUrl ? (
                                    <div
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors duration-150 ${isDragging
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-base-300 hover:border-primary/50 bg-base-100 hover:bg-base-200/50'
                                            }`}
                                        onClick={handleBrowseClick}
                                    >
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1">
                                                <Upload size={24} />
                                            </div>
                                            <strong className="text-sm font-semibold text-base-content">
                                                Drag &amp; drop after-correction image here, or click to browse
                                            </strong>
                                            <p className="text-xs text-base-content/60 max-w-sm">
                                                Select a photo showing the worker wearing the required PPE. Accepts JPEG, PNG, WebP (up to 8 MB).
                                            </p>
                                            <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-primary gap-1"
                                                    disabled={isProcessing}
                                                    onClick={handleBrowseClick}
                                                >
                                                    <Upload size={12} /> Browse Image
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-outline gap-1"
                                                    disabled={isProcessing}
                                                    onClick={handleCameraClick}
                                                >
                                                    <Camera size={12} /> Use Camera
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Image Preview Before Submission */
                                    <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-base-content flex items-center gap-1.5">
                                                <CheckCircle size={14} className="text-primary" /> Selected Image Preview
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-outline gap-1"
                                                    disabled={isProcessing}
                                                    onClick={handleBrowseClick}
                                                >
                                                    <RotateCcw size={12} /> Replace Image
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-xs btn-ghost text-error gap-1"
                                                    disabled={isProcessing}
                                                    onClick={handleClearSelected}
                                                >
                                                    <X size={12} /> Remove
                                                </button>
                                            </div>
                                        </div>

                                        <div className="relative rounded-lg overflow-hidden bg-base-300 flex items-center justify-center max-h-64">
                                            <img
                                                src={previewUrl}
                                                alt="After-correction preview"
                                                className="max-h-64 w-full object-contain"
                                            />
                                        </div>

                                        {selectedFile && (
                                            <div className="text-[11px] text-base-content/60 flex items-center justify-between border-t border-base-300 pt-2">
                                                <span>Filename: <strong>{selectedFile.name}</strong></span>
                                                <span>Size: {(selectedFile.size / 1024).toFixed(1)} KB</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Processing Progress Indicator */}
                                {isProcessing && (
                                    <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-xs text-primary flex items-center gap-2.5">
                                        <span className="loading loading-spinner loading-xs shrink-0" />
                                        <span className="font-semibold">{processingStep || 'Processing after-correction evaluation…'}</span>
                                    </div>
                                )}

                                {/* Upload & Verify Action Buttons */}
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                                    <p className="text-[11px] text-base-content/60">
                                        {!selectedFile ? 'Select an after-correction image to begin verification.' : 'Ready to verify. Click below to execute real YOLO inference.'}
                                    </p>

                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-primary w-full sm:w-auto gap-2 font-semibold shadow-sm"
                                            disabled={!selectedFile || isProcessing}
                                            onClick={handleUploadAndVerify}
                                        >
                                            {isProcessing ? (
                                                <>
                                                    <span className="loading loading-spinner loading-xs" />
                                                    Evaluating…
                                                </>
                                            ) : (
                                                <>
                                                    <ShieldCheck size={16} />
                                                    Upload and Verify
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* View for Safety Reporter (Read-only notice) */}
                        {isReporter && (
                            <div className="rounded-lg bg-base-300/40 p-3 text-xs text-base-content/60 border border-base-300">
                                <span className="font-semibold block text-base-content/80 mb-0.5">Safety Reporter Mode:</span>
                                After-correction verification and report closure are restricted to authorized Safety Officers.
                            </div>
                        )}
                    </div>

                    {/* Step 4: Activity Trail / Audit Log */}
                    <div className="space-y-3 pt-2">
                        <h3 className="text-xs font-bold text-base-content uppercase tracking-wider flex items-center gap-1.5">
                            <Clock size={14} className="text-base-content/60" /> Activity &amp; Audit Trail
                        </h3>
                        <div className="history border-l-2 border-primary/30 pl-4 space-y-3">
                            {item.history.map((h, k) => (
                                <div key={k} className="relative space-y-0.5">
                                    <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary" />
                                    <p className="text-xs text-base-content/85">{h.text}</p>
                                    <small className="text-[10px] text-base-content/40 block">
                                        {new Date(h.time).toLocaleString('en-IN', {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </small>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
