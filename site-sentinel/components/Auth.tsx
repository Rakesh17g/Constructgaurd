import React, { useState } from 'react';
import { ShieldCheck, Eye, EyeOff, ArrowLeft, Mail, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './Auth.css';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

interface AuthProps {
    intendedRole?: 'reporter' | 'safety_officer' | null;
    onAuthenticated: () => void;
    onSwitchRole?: () => void;
}

interface DiagnosticAuthError {
    name?: string;
    message?: string;
    status?: number;
    code?: string;
}

interface ErrorDetails {
    message: string;
    isRateLimit: boolean;
    isExistingUser: boolean;
    retryAfter?: number;
}

function getErrorMessage(error: unknown, operation = 'auth'): ErrorDetails {
    if (!error) {
        return {
            message: 'An unexpected error occurred. Please try again.',
            isRateLimit: false,
            isExistingUser: false,
        };
    }

    const err = error as DiagnosticAuthError;
    const rawMsg = err.message || String(error);
    const msg = rawMsg.toLowerCase();
    const status = err.status;
    const code = err.code || '';

    // Safe developer diagnostic logging (strictly no passwords, tokens, or credentials)
    console.warn(`[Constructgaurd Auth] Operation '${operation}' failed:`, {
        code,
        status,
        message: rawMsg,
    });

    const isRateLimit = status === 429 || code === 'over_email_send_rate_limit' || msg.includes('rate limit');
    if (isRateLimit) {
        return {
            message: 'Email sending rate limit reached. Supabase free/default email service allows a maximum of 2 emails per hour.',
            isRateLimit: true,
            isExistingUser: false,
            retryAfter: 60,
        };
    }

    const isExistingUser = code === 'user_already_exists' || msg.includes('user already registered') || msg.includes('already registered');
    if (isExistingUser) {
        return {
            message: 'An account with this email already exists. Try signing in.',
            isRateLimit: false,
            isExistingUser: true,
        };
    }

    if (code === 'email_address_invalid' || msg.includes('invalid email') || msg.includes('unable to validate email')) {
        return { message: 'Please enter a valid email address.', isRateLimit: false, isExistingUser: false };
    }
    if (msg.includes('invalid login credentials')) {
        return { message: 'Email or password is incorrect. Please try again.', isRateLimit: false, isExistingUser: false };
    }
    if (msg.includes('password should be at least')) {
        return { message: 'Password must be at least 6 characters long.', isRateLimit: false, isExistingUser: false };
    }
    if (msg.includes('email not confirmed')) {
        return { message: 'Please verify your email before signing in. Check your inbox.', isRateLimit: false, isExistingUser: false };
    }
    if (msg.includes('token has expired') || code === 'token_expired') {
        return { message: 'This link has expired. Please request a new one.', isRateLimit: false, isExistingUser: false };
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
        return { message: 'Network error. Please check your internet connection.', isRateLimit: false, isExistingUser: false };
    }
    if (msg.includes('security purposes')) {
        return { message: 'For security reasons, please wait a moment before requesting another email.', isRateLimit: false, isExistingUser: false };
    }
    if (msg.includes('database error') || msg.includes('profile provisioning')) {
        return { message: 'Your account could not be created because profile provisioning failed. Please try again.', isRateLimit: false, isExistingUser: false };
    }
    if (msg.includes('requires approval') || msg.includes('pending approval')) {
        return { message: 'Your Safety Officer account requires approval.', isRateLimit: false, isExistingUser: false };
    }

    return { message: 'Registration could not be completed. Please try again.', isRateLimit: false, isExistingUser: false };
}

export const Auth: React.FC<AuthProps> = ({ intendedRole, onAuthenticated, onSwitchRole }) => {
    const [mode, setMode] = useState<Mode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [cooldownSeconds, setCooldownSeconds] = useState(0);
    const [existingAccountDetected, setExistingAccountDetected] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [success, setSuccess] = useState('');

    // Synchronous submission lock to prevent concurrent requests before state updates re-render
    const isSubmittingRef = React.useRef(false);

    // Active cooldown countdown timer
    React.useEffect(() => {
        if (cooldownSeconds <= 0) return;
        const interval = setInterval(() => {
            setCooldownSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [cooldownSeconds]);

    const clearMessages = () => {
        setError('');
        setInfo('');
        setSuccess('');
        setExistingAccountDetected(false);
    };

    const handleTabChange = (m: 'signin' | 'signup') => {
        if (loading) return; // Prevent switching while request is in flight
        setMode(m);
        clearMessages();
        setPassword('');
    };

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        clearMessages();

        // Synchronous guard against double clicks or race conditions
        if (isSubmittingRef.current || loading) return;

        const cleanEmail = email.trim();
        if (!cleanEmail || !password) {
            setError('Please enter your email and password.');
            return;
        }

        isSubmittingRef.current = true;
        setLoading(true);
        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password,
            });
            if (signInError) {
                const details = getErrorMessage(signInError, 'signInWithPassword');
                setError(details.message);
                if (details.isRateLimit) {
                    setCooldownSeconds(details.retryAfter || 60);
                }
                return;
            }
            onAuthenticated();
        } catch (err) {
            const details = getErrorMessage(err, 'signInWithPassword');
            setError(details.message);
            if (details.isRateLimit) {
                setCooldownSeconds(details.retryAfter || 60);
            }
        } finally {
            isSubmittingRef.current = false;
            setLoading(false);
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        clearMessages();

        // Synchronous guard against double clicks and active cooldown
        if (isSubmittingRef.current || loading || cooldownSeconds > 0) return;

        const cleanEmail = email.trim();
        if (!cleanEmail) {
            setError('Please enter your email address.');
            return;
        }

        // Standard RFC-compliant client email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            setError('Please enter a valid email address.');
            return;
        }

        if (!password) {
            setError('Please enter a password.');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }

        isSubmittingRef.current = true;
        setLoading(true);
        try {
            const roleToAssign = intendedRole || 'reporter';
            const { data, error: signUpError } = await supabase.auth.signUp({
                email: cleanEmail,
                password,
                options: {
                    emailRedirectTo: window.location.origin,
                    data: {
                        intended_role: roleToAssign,
                        role: roleToAssign === 'safety_officer' ? 'safety_officer' : 'reporter'
                    }
                }
            });

            if (signUpError) {
                const details = getErrorMessage(signUpError, 'signUp');
                setError(details.message);
                if (details.isRateLimit) {
                    setCooldownSeconds(details.retryAfter || 60);
                }
                if (details.isExistingUser) {
                    setExistingAccountDetected(true);
                }
                return;
            }

            // Supabase returns an empty identities array if the user is already registered
            // when email confirmation is active (to prevent user enumeration).
            if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
                setError('An account with this email already exists.');
                setExistingAccountDetected(true);
                return;
            }

            // If session is returned immediately (e.g. email confirmation disabled on project)
            if (data?.session) {
                onAuthenticated();
            } else {
                // Email confirmation is required by Supabase Auth configuration
                setInfo('Your account was created, but email verification is still required. Please check your inbox and click the confirmation link to activate your account.');
                setPassword('');
            }
        } catch (err) {
            const details = getErrorMessage(err, 'signUp');
            setError(details.message);
            if (details.isRateLimit) {
                setCooldownSeconds(details.retryAfter || 60);
            }
            if (details.isExistingUser) {
                setExistingAccountDetected(true);
            }
        } finally {
            isSubmittingRef.current = false;
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        clearMessages();
        if (isSubmittingRef.current || loading || cooldownSeconds > 0) return;

        if (!email) { setError('Please enter your email address.'); return; }
        isSubmittingRef.current = true;
        setLoading(true);
        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}${window.location.pathname}`,
            });
            if (resetError) {
                const details = getErrorMessage(resetError, 'resetPasswordForEmail');
                setError(details.message);
                if (details.isRateLimit) {
                    setCooldownSeconds(details.retryAfter || 60);
                }
                return;
            }
            setSuccess('Password reset email sent. Please check your inbox and click the link to reset your password.');
        } catch (err) {
            const details = getErrorMessage(err, 'resetPasswordForEmail');
            setError(details.message);
            if (details.isRateLimit) {
                setCooldownSeconds(details.retryAfter || 60);
            }
        } finally {
            isSubmittingRef.current = false;
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        clearMessages();
        if (isSubmittingRef.current || loading) return;

        if (!newPassword) { setError('Please enter your new password.'); return; }
        if (newPassword.length < 6) { setError('Password must be at least 6 characters long.'); return; }
        isSubmittingRef.current = true;
        setLoading(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
            if (updateError) {
                const details = getErrorMessage(updateError, 'updateUser');
                setError(details.message);
                return;
            }
            setSuccess('Password updated successfully!');
            setTimeout(() => onAuthenticated(), 1500);
        } catch (err) {
            const details = getErrorMessage(err, 'updateUser');
            setError(details.message);
        } finally {
            isSubmittingRef.current = false;
            setLoading(false);
        }
    };

    const renderMessages = () => (
        <>
            {cooldownSeconds > 0 && (
                <div className="auth-rate-limit-banner" role="alert">
                    <div className="auth-rate-limit-header">
                        <AlertCircle size={15} />
                        <span>Email sending temporarily limited</span>
                    </div>
                    <div>
                        Supabase allows 2 verification emails per hour without custom SMTP. Please wait{' '}
                        <strong>{cooldownSeconds}s</strong> before retrying.
                    </div>
                    {mode === 'signup' && (
                        <button
                            type="button"
                            className="auth-action-link"
                            onClick={() => handleTabChange('signin')}
                        >
                            Already registered? Switch to Sign In &rarr;
                        </button>
                    )}
                </div>
            )}
            {error && (
                <div className="auth-error" role="alert">
                    <AlertCircle size={14} className="auth-msg-icon" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                        <span>{error}</span>
                        {existingAccountDetected && mode === 'signup' && (
                            <button
                                type="button"
                                className="auth-action-link"
                                onClick={() => handleTabChange('signin')}
                            >
                                Sign in to this account &rarr;
                            </button>
                        )}
                    </div>
                </div>
            )}
            {info && (
                <div className="auth-info" role="status">
                    <Info size={14} className="auth-msg-icon" />
                    <span>{info}</span>
                </div>
            )}
            {success && (
                <div className="auth-success" role="status">
                    <CheckCircle size={14} className="auth-msg-icon" />
                    <span>{success}</span>
                </div>
            )}
        </>
    );

    const renderBrand = () => (
        <div className="auth-brand">
            <div className="auth-brandmark" style={{ background: 'transparent', boxShadow: 'none' }}>
                <img src="/logo.png" alt="Construct gaurd" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div className="auth-brandtext">
                <strong>Construct gaurd<span>.</span></strong>
                <small>SAFETY INTELLIGENCE</small>
            </div>
        </div>
    );

    // === RESET PASSWORD (after clicking email link) ===
    if (mode === 'reset') {
        return (
            <div className="auth-root">
                <div className="auth-card">
                    {renderBrand()}
                    <button className="auth-btn-ghost" onClick={() => { setMode('signin'); clearMessages(); }}>
                        <ArrowLeft size={14} /> Back to sign in
                    </button>
                    <h1 className="auth-heading">Set new password</h1>
                    <p className="auth-subheading">Choose a strong password for your account.</p>
                    <form className="auth-form" onSubmit={handleResetPassword} noValidate>
                        {renderMessages()}
                        <div className="auth-field">
                            <label className="auth-label" htmlFor="new-password">New Password</label>
                            <div className="auth-input-wrap">
                                <input
                                    id="new-password"
                                    className={`auth-input${error ? ' error' : ''}`}
                                    type={showNewPassword ? 'text' : 'password'}
                                    placeholder="At least 6 characters"
                                    value={newPassword}
                                    onChange={e => { setNewPassword(e.target.value); clearMessages(); }}
                                    autoComplete="new-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="auth-eye-btn"
                                    onClick={() => setShowNewPassword(v => !v)}
                                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <button type="submit" className="auth-btn-primary" disabled={loading}>
                            {loading ? <span className="auth-spinner" /> : null}
                            {loading ? 'Updating…' : 'Update password'}
                        </button>
                    </form>
                    <p className="auth-footer-note">CONSTRUCTGAURD · SAFETY INTELLIGENCE PLATFORM</p>
                </div>
            </div>
        );
    }

    // === FORGOT PASSWORD ===
    if (mode === 'forgot') {
        return (
            <div className="auth-root">
                <div className="auth-card">
                    {renderBrand()}
                    <button className="auth-btn-ghost" onClick={() => { setMode('signin'); clearMessages(); }}>
                        <ArrowLeft size={14} /> Back to sign in
                    </button>
                    <h1 className="auth-heading">Reset password</h1>
                    <p className="auth-subheading">Enter your email and we'll send you a link to reset your password.</p>
                    <form className="auth-form" onSubmit={handleForgotPassword} noValidate>
                        {renderMessages()}
                        <div className="auth-field">
                            <label className="auth-label" htmlFor="forgot-email">Email address</label>
                            <div className="auth-input-wrap">
                                <input
                                    id="forgot-email"
                                    className={`auth-input${error ? ' error' : ''}`}
                                    type="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={e => { setEmail(e.target.value); clearMessages(); }}
                                    autoComplete="email"
                                    required
                                />
                                <span className="auth-eye-btn" style={{ pointerEvents: 'none' }}>
                                    <Mail size={15} />
                                </span>
                            </div>
                        </div>
                        <button type="submit" className="auth-btn-primary" disabled={loading || !!success}>
                            {loading ? <span className="auth-spinner" /> : null}
                            {loading ? 'Sending…' : 'Send reset link'}
                        </button>
                    </form>
                    <p className="auth-footer-note">CONSTRUCTGAURD · SAFETY INTELLIGENCE PLATFORM</p>
                </div>
            </div>
        );
    }

    // === SIGN IN / SIGN UP ===
    const isSignUp = mode === 'signup';
    return (
        <div className="auth-root">
            <div className="auth-card">
                {renderBrand()}
                <h1 className="auth-heading">{isSignUp ? 'Create account' : 'Welcome back'}</h1>
                <p className="auth-subheading">
                    {isSignUp
                        ? `Sign up to access the safety intelligence platform as a ${intendedRole === 'safety_officer' ? 'Safety Officer' : 'Safety Reporter'}.`
                        : `Sign in to access your role-based workspace and inspections.`}
                </p>

                <div className="auth-tabs" role="tablist">
                    <button
                        role="tab"
                        aria-selected={!isSignUp}
                        className={`auth-tab${!isSignUp ? ' active' : ''}`}
                        onClick={() => handleTabChange('signin')}
                    >
                        Sign in
                    </button>
                    <button
                        role="tab"
                        aria-selected={isSignUp}
                        className={`auth-tab${isSignUp ? ' active' : ''}`}
                        onClick={() => handleTabChange('signup')}
                    >
                        Create account
                    </button>
                </div>

                <form
                    className="auth-form"
                    onSubmit={isSignUp ? handleSignUp : handleSignIn}
                    noValidate
                >
                    {renderMessages()}

                    <div className="auth-field">
                        <label className="auth-label" htmlFor="auth-email">Email address</label>
                        <div className="auth-input-wrap">
                            <input
                                id="auth-email"
                                className={`auth-input${error && !password ? ' error' : ''}`}
                                type="email"
                                placeholder="you@company.com"
                                value={email}
                                onChange={e => { setEmail(e.target.value); clearMessages(); }}
                                autoComplete="email"
                                disabled={loading || cooldownSeconds > 0}
                                required
                            />
                            <span className="auth-eye-btn" style={{ pointerEvents: 'none' }}>
                                <Mail size={15} />
                            </span>
                        </div>
                    </div>

                    <div className="auth-field">
                        <label className="auth-label" htmlFor="auth-password">Password</label>
                        <div className="auth-input-wrap">
                            <input
                                id="auth-password"
                                className={`auth-input${error ? ' error' : ''}`}
                                type={showPassword ? 'text' : 'password'}
                                placeholder={isSignUp ? 'At least 6 characters' : '••••••••'}
                                value={password}
                                onChange={e => { setPassword(e.target.value); clearMessages(); }}
                                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                                disabled={loading || cooldownSeconds > 0}
                                required
                            />
                            <button
                                type="button"
                                className="auth-eye-btn"
                                onClick={() => setShowPassword(v => !v)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {!isSignUp && (
                        <div className="auth-forgot">
                            <button type="button" onClick={() => { setMode('forgot'); clearMessages(); }}>
                                Forgot password?
                            </button>
                        </div>
                    )}

                    <button type="submit" className="auth-btn-primary" disabled={loading || cooldownSeconds > 0}>
                        {loading ? <span className="auth-spinner" /> : null}
                        {loading
                            ? isSignUp ? 'Creating account…' : 'Signing in…'
                            : cooldownSeconds > 0
                                ? `Please wait (${cooldownSeconds}s)`
                                : isSignUp ? 'Create account' : 'Sign in'}
                    </button>
                </form>

                {onSwitchRole && (
                    <div style={{ marginTop: '16px', textAlign: 'center' }}>
                        <button type="button" className="auth-btn-ghost" onClick={onSwitchRole}>
                            <ArrowLeft size={14} style={{ display: 'inline-block', marginRight: '6px' }} /> Return to role selection
                        </button>
                    </div>
                )}

                <p className="auth-footer-note">CONSTRUCTGAURD · SAFETY INTELLIGENCE PLATFORM</p>
            </div>
        </div>
    );
};
