// AdminPanel.jsx
// -------------------------------------------------
// A very small, self‑contained placeholder admin panel written in React.
// It is *not* wired to any backend yet – the tables display mock data so
// you can see the intended structure right away.
// -------------------------------------------------
import React, { useState } from "react";
import "./Admin.css";

export default function Admin() {
    /* ---------------------------------------------------
       Local mock‑state – replace with real API calls later
    --------------------------------------------------- */
    const [runs, setRuns] = useState([
        { id: 1, date: "2025‑06‑15 01:14", pages: 128, pdfs: 67, status: "Finished" },
        { id: 2, date: "2025‑06‑14 22:50", pages: 74, pdfs: 33, status: "Finished" },
        { id: 3, date: "2025‑06‑13 10:32", pages: 256, pdfs: 98, status: "Failed" },
    ]);
    const [log, setLog] = useState("Crawler idle. Ready for a new run…");
    const [startUrl, setStartUrl] = useState("https://hiddenroad.com/");

    // Placeholder handler -------------------------------------------------
    const triggerCrawl = () => {
        setLog(prev => prev + "\n[" + new Date().toLocaleTimeString() + "] ▶ Crawl queued for " + startUrl);
        // In a real implementation you would POST to your backend here.
    };

    /* ---------------------------------------------------
       Render
    --------------------------------------------------- */
    return (
        <div className="adminpanel">
            <header className="ap‑header">Hidden‑Road Crawler / Admin Panel</header>

            {/* ────── Controls row ────── */}
            <section className="ap‑controls">
                <input
                    type="text"
                    className="ap‑input"
                    value={startUrl}
                    onChange={e => setStartUrl(e.target.value)}
                    placeholder="Start URL"
                />
                <button className="ap‑button" onClick={triggerCrawl}>Run crawl</button>
            </section>

            {/* ────── Recent runs table ────── */}
            <section className="ap‑card">
                <h2>Recent crawler runs</h2>
                <table className="ap‑table">
                    <thead>
                        <tr>
                            <th>ID</th><th>Started at</th><th>Pages</th><th>PDFs</th><th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {runs.map(r => (
                            <tr key={r.id} className={"status‑" + r.status.toLowerCase()}>
                                <td>{r.id}</td>
                                <td>{r.date}</td>
                                <td>{r.pages}</td>
                                <td>{r.pdfs}</td>
                                <td>{r.status}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {/* ────── Log output ────── */}
            <section className="ap‑card">
                <h2>Live log</h2>
                <pre className="ap‑log" spellCheck="false">{log}</pre>
            </section>
        </div>
    );
}


