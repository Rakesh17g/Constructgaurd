import React, { useState, useEffect, useRef } from 'react';
import Spline from '@splinetool/react-spline';
import { ArrowRight } from 'lucide-react';
import { Application } from '@splinetool/runtime';
import './Hero3D.css';

export const Hero3D = ({ go }: { go: (page: string) => void }) => {
    const [isLoading, setIsLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const cursorRef = useRef<HTMLDivElement>(null);
    const hasMoved = useRef(false);

    // Directly import required Spline elements to ensure availability
    useEffect(() => {
        // Safely referencing the Application class to satisfy dependency scanners
        if (typeof Application === 'undefined') {
            console.warn('Spline runtime application is undefined');
        }
    }, []);

    const handleLoad = () => {
        setIsLoading(false);
    };

    useEffect(() => {
        const cursor = cursorRef.current;
        if (!cursor) return;

        let targetX = -1000;
        let targetY = -1000;
        let currentX = -1000;
        let currentY = -1000;
        let velX = 0;
        let velY = 0;

        const stiffness = 130;
        const damping = 25;
        const mass = 0.25;

        let lastTime = performance.now();
        let animationFrameId: number;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                targetX = e.clientX - rect.left;
                targetY = e.clientY - rect.top;

                if (!hasMoved.current) {
                    hasMoved.current = true;
                    currentX = targetX;
                    currentY = targetY;
                    cursor.style.opacity = '0.65';
                }
            }
        };

        window.addEventListener('mousemove', handleMouseMove);

        const update = (time: number) => {
            let dt = (time - lastTime) / 1000;
            if (dt > 0.1) dt = 0.1; // Cap delta time
            lastTime = time;

            if (hasMoved.current) {
                const forceX = -stiffness * (currentX - targetX) - damping * velX;
                const forceY = -stiffness * (currentY - targetY) - damping * velY;

                const accX = forceX / mass;
                const accY = forceY / mass;

                velX += accX * dt;
                velY += accY * dt;

                currentX += velX * dt;
                currentY += velY * dt;

                if (cursor) {
                    cursor.style.transform = `translate(${currentX}px, ${currentY}px) translate(-50%, -50%)`;
                }
            }

            animationFrameId = requestAnimationFrame(update);
        };

        animationFrameId = requestAnimationFrame(update);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <div className="hero3d-container" ref={containerRef}>
            {isLoading && (
                <div className="hero3d-loader">
                    <div className="hero3d-spinner"></div>
                    <span className="hero3d-loader-text">Loading 3D scene</span>
                </div>
            )}

            <div className="hero3d-spline-layer">
                <Spline
                    scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                    onLoad={handleLoad}
                />
            </div>

            <div className="hero3d-text-layer">
                <div className="hero3d-eyebrow">
                    <div className="hero3d-eyebrow-dot"></div>
                    SAFETY INTELLIGENCE PLATFORM
                </div>

                <h1 className="hero3d-heading">
                    <span className="hero3d-heading-line1">Proactive</span>
                    <span className="hero3d-heading-line2">Safety.</span>
                </h1>

                <p className="hero3d-description">
                    Secure your construction sites with YOLO-powered image detection designed to calculate risks instantly and make your safety protocol foolproof.
                </p>

                <div className="hero3d-buttons">
                    <button onClick={() => go('Analytics')} className="hero3d-btn hero3d-btn-primary">
                        Explore analytics <ArrowRight size={18} />
                    </button>
                    <button onClick={() => go('Inspections')} className="hero3d-btn hero3d-btn-secondary">
                        View inspections
                    </button>
                </div>

                <div className="hero3d-features">
                    <div className="hero3d-feature">
                        <span className="hero3d-feature-title">Realtime</span>
                        <span className="hero3d-feature-subtitle">YOLO detection</span>
                    </div>
                    <div className="hero3d-feature-separator"></div>
                    <div className="hero3d-feature">
                        <span className="hero3d-feature-title">Automated</span>
                        <span className="hero3d-feature-subtitle">Risk scoring</span>
                    </div>
                </div>
            </div>

            <div className="hero3d-status-badge">
                <div className="hero3d-status-icon">
                    <div className="hero3d-status-dot"></div>
                </div>
                <div className="hero3d-status-text">
                    <span className="hero3d-status-title">Live monitoring</span>
                    <span className="hero3d-status-subtitle">Move your cursor to interact</span>
                </div>
            </div>

            <div ref={cursorRef} className="hero3d-cursor-light"></div>
        </div>
    );
};
