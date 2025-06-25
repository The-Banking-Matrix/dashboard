// src/Sections/Landing/Landing.jsx
import React, { useEffect, useRef, useState } from 'react';
import ColumnImg from '../../../../assets/images/column.png';
import './Landing.css';

// Corrected import path — make sure this matches your filesystem exactly:
import WaitlistForm from '../../../../Components/WaitlistForm/WaitlistForm';



export default function Landing() {
    const scrollRef = useRef(null);
    const howRef = useRef(null);
    const waitRef = useRef(null);

    const [showWait, setShowWait] = useState(false);
    const [visibleSteps, setVisibleSteps] = useState([]);

    /* reveal waitlist when it scrolls into view */
    useEffect(() => {
        if (!scrollRef.current || !waitRef.current) return;
        const obs = new IntersectionObserver(
            ([entry], ob) => {
                if (entry.isIntersecting) {
                    setShowWait(true);
                    ob.unobserve(entry.target);
                }
            },
            { root: scrollRef.current, threshold: 0.5 }
        );
        obs.observe(waitRef.current);
        return () => obs.disconnect();
    }, []);

    /* fade-in each step on first scroll */
    useEffect(() => {
        if (!scrollRef.current) return;
        const cards = scrollRef.current.querySelectorAll('.step-box');
        const obs = new IntersectionObserver(
            (entries, ob) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const idx = Number(entry.target.dataset.idx);
                        setVisibleSteps(v => (v.includes(idx) ? v : [...v, idx]));
                        ob.unobserve(entry.target);
                    }
                });
            },
            { root: scrollRef.current, threshold: 0.3 }
        );
        cards.forEach(c => obs.observe(c));
        return () => obs.disconnect();
    }, []);

    const scrollTo = ref => {
        if (scrollRef.current && ref.current) {
            scrollRef.current.scrollTo({
                top: ref.current.offsetTop,
                behavior: 'smooth'
            });
        }
    };

    const steps = [
        {
            title: 'Curated Bank Data',
            desc: 'about your structure, jurisdictions, transaction needs, risk appetite, ...'
        },
        {
            title: 'Start Matching',
            desc: 'Ask questions, get compliant and explainable matches.'
        },
        {
            title: 'Evidence-Based',
            desc: 'Each result includes license, fees, lead time, onboarding documents, and regulation sources'
        }
    ];

    return (
        <div className="landing-root">
            <img src={ColumnImg} className="column left" alt="" />
            <img src={ColumnImg} className="column right" alt="" style={{ transform: 'scaleX(-1)' }} />

            <div className="scroll-container" ref={scrollRef}>
                {/* HERO */}
                <section className="intro">
                    <h1 className="title">Tailored banking, enduring legacy.</h1>
                    <p className="subtext">Align with a banking partner as discerning as your vision.</p>
                    <div className="button-group">
                        <button className="cta-button" onClick={() => scrollTo(howRef)}>How It Works</button>
                        <button className="cta-button" onClick={() => scrollTo(waitRef)}>Join the Waitlist</button>
                    </div>
                </section>

                {/* HOW IT WORKS */}
                <section ref={howRef} className="how-it-works">
                    <h2 className="title">How It Works</h2>
                    <div className="steps-grid">
                        {steps.map((s, idx) => (
                            <div
                                key={idx}
                                data-idx={idx}
                                className={`step-box ${visibleSteps.includes(idx) ? 'visible' : ''}`}
                            >
                                <div className="step-number">{idx + 1}</div>
                                <h3>{s.title}</h3>
                                <p>{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* WAITLIST */}
                <section ref={waitRef} className={`waitlist${showWait ? ' visible' : ''}`}>
                    <h2 className="title">Join the waitlist</h2>
                    <p className="subtext">
                        Get exclusive early access to our tailored bank-matching platform.
                    </p>
                    <WaitlistForm />
                </section>
            </div>
        </div>
    );
}
