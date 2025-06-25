import React, { useState, useRef, useEffect } from 'react';
import './Overview.css';

/* --------------------------------------------
   Helper → convert [label](url) to <a> links
--------------------------------------------- */
function renderMarkdownLinks(text) {
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
        parts.push(
            <a
                key={key++}
                href={match[2]}
                target="_blank"
                rel="noopener noreferrer"
                className="md-link"
            >
                {match[1]}
            </a>
        );
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
}

export default function Overview() {
    /* ----------------------
       React state & refs
    ----------------------- */
    const [messages, setMessages] = useState([]);           // start with empty history
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    /* ----------------------
       Effects
    ----------------------- */
    // scroll to newest message
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    /* ----------------------
       Message send handler
    ----------------------- */
    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const msgText = input.trim();
        const nextMessages = [...messages, { role: 'user', text: msgText }];

        setMessages(nextMessages);
        setLoading(true);

        // Prepare format expected by backend (assistant/user roles)
        const conversation = nextMessages.map(m => ({
            role: m.role === 'bot' ? 'assistant' : m.role,  // migrate any legacy 'bot'
            content: m.text
        }));

        try {
            const res = await fetch('http://localhost:3001/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation })
            });
            const data = await res.json();
            setMessages(m => [
                ...m,
                { role: 'assistant', text: data?.text || 'No response.' }
            ]);
        } catch (err) {
            setMessages(m => [
                ...m,
                { role: 'assistant', text: 'Server error 😞' }
            ]);
        }

        setInput('');
        setLoading(false);
        inputRef.current?.focus();
    };

    /* ----------------------
       Handle Enter key
    ----------------------- */
    const onKey = e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    /* ----------------------
       Render
    ----------------------- */
    return (
        <div className="chat-wrap clean-ui">
            {/* Fixed minimal header */}
            <header className="chat-header">
                The&nbsp;Banking&nbsp;Matrix
            </header>

            {/* Scrolling chat area */}
            <div className="chat-window">
                {messages.map((m, i) => (
                    <div key={i} className={`msg ${m.role}`}>
                        <div className="bubble">
                            {m.text.split('\n').map((line, j) => (
                                <div
                                    key={j}
                                    className={
                                        line.startsWith('•') || line.startsWith('↳')
                                            ? 'bankline'
                                            : ''
                                    }
                                >
                                    {renderMarkdownLinks(line)}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div className="chat-controls">
                <textarea
                    ref={inputRef}
                    className="chat-input"
                    placeholder="Type your question…"
                    value={input}
                    disabled={loading}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKey}
                    rows={2}
                />
                <button
                    className="send-btn"
                    onClick={sendMessage}
                    disabled={loading || !input.trim()}
                >
                    {loading ? '…' : 'Send'}
                </button>
            </div>
        </div>
    );
}
