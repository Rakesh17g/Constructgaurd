import React, { useState } from 'react';
import { ShieldCheck, Eye, EyeOff, ArrowLeft, Mail, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './Auth.css';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

interface AuthProps {
    onAuthenticated: () => void;
}

function getErrorMessage(error: unknown): string {
    if (!error) return 'An unexpected error occurred.';
    const msg = (error as { message?: string }).message || String(error);

    // Map Supabase error messages to user-friendly strings
    if (msg.includes('Invalid login credentials')) return 'Email or password is incorrect. Please try again.';
    if (msg.includes('User already registered')) return 'An account with this email already exists. Try signing in.';
    if (msg.includes('Password should be at least')) return 'Password must be at least 6 characters long.';
    if (msg.includes('Email not confirmed')) return 'Please verify your email before signing in. Check your inbox.';
    if (msg.includes('Email rate limit exceeded')) return 'Too many requests. Please wait a few minutes and try again.';
    if (msg.includes('Token has expired')) return 'This reset link has expired. Please request a new one.';
    if (msg.toLowerCase().includes('network') || msg.includes('fetch')) return 'Network error. Please check your connection.';
    if (msg.includes('For security purposes')) return 'For security reasons, please wait before requesting another email.';
    // Don't expose raw Supabase internals
    return 'Something went wrong. Please try again.';
}

export const Auth: React.FC<AuthProps> = ({ onAuthenticated }) => {
    const [mode, setMode] = useState<Mode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [success, setSuccess] = useState('');

    const clearMessages = () => { setError(''); setInfo(''); setSuccess(''); };

    const handleTabChange = (m: 'signin' | 'signup') => {
        setMode(m);
        clearMessages();
        setPassword('');
    };

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        clearMessages();
        if (!email || !password) { setError('Please enter your email and password.'); return; }
        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
            if (error) { setError(getErrorMessage(error)); return; }
            onAuthenticated();
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        clearMessages();
        if (!email || !password) { setError('Please enter your email and password.'); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters long.'); return; }
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
            if (error) { setError(getErrorMessage(error)); return; }
            // If user is immediately confirmed (e.g. email confirmation disabled)
            if (data.session) {
                onAuthenticated();
            } else {
                setInfo('Account created! Please check your email and click the confirmation link to activate your account.');
                setPassword('');
            }
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        clearMessages();
        if (!email) { setError('Please enter your email address.'); return; }
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}${window.location.pathname}`,
            });
            if (error) { setError(getErrorMessage(error)); return; }
            setSuccess('Password reset email sent. Please check your inbox and click the link to reset your password.');
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        clearMessages();
        if (!newPassword) { setError('Please enter your new password.'); return; }
        if (newPassword.length < 6) { setError('Password must be at least 6 characters long.'); return; }
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) { setError(getErrorMessage(error)); return; }
            setSuccess('Password updated successfully!');
            setTimeout(() => onAuthenticated(), 1500);
        } catch (err) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const renderMessages = () => (
        <>
            {error && (
                <div className="auth-error" role="alert">
                    <AlertCircle size={14} className="auth-msg-icon" />
                    <span>{error}</span>
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
                        ? 'Sign up to access the safety intelligence platform.'
                        : 'Sign in to access your workspace and inspections.'}
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

                    <button type="submit" className="auth-btn-primary" disabled={loading}>
                        {loading ? <span className="auth-spinner" /> : null}
                        {loading
                            ? isSignUp ? 'Creating account…' : 'Signing in…'
                            : isSignUp ? 'Create account' : 'Sign in'}
                    </button>
                </form>

                <p className="auth-footer-note">CONSTRUCTGAURD · SAFETY INTELLIGENCE PLATFORM</p>
            </div>
        </div>
    );
};
