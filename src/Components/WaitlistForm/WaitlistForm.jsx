import React, { useState } from 'react';
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from 'firebase/firestore';
import { waitlistColl } from '../../firebase';
import './WaitlistForm.css';

export default function WaitlistForm() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle');
    // 'idle' | 'loading' | 'success' | 'exists' | 'error'

    const handleSubmit = async e => {
        e.preventDefault();
        const addr = email.trim().toLowerCase();
        if (!addr) return;
        setStatus('loading');

        try {
            const ref = doc(waitlistColl, addr);
            const snap = await getDoc(ref);

            if (snap.exists()) {
                setStatus('exists');
            } else {
                await setDoc(ref, { joinedAt: serverTimestamp() });
                setStatus('success');
            }
        } catch (err) {
            console.error(err);
            setStatus('error');
        }
    };

    if (status === 'success') {
        return <p className="thanks">You've been added to our waitlist.</p>;
    }
    if (status === 'exists') {
        return <p className="thanks">You’re already on the waitlist.</p>;
    }

    return (
        <form className="email-form" onSubmit={handleSubmit}>
            <input
                type="email"
                className="email-input"
                placeholder="Enter your best email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={status === 'loading'}
            />
            <button
                type="submit"
                className="cta-button"
                disabled={status === 'loading'}
            >
                {status === 'loading' ? 'Processing…' : 'Submit'}
            </button>

            {status === 'error' && (
                <p className="error">Something went wrong — please try again.</p>
            )}
        </form>
    );
}
