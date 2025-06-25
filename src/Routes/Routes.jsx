/* ─── src/routes.jsx ─────────────────────────────────────────── */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from '../Pages/Home/Sections/Landing/Landing';
import Overview from '../Pages/Dashboard/Overview';
import Admin from '../Admin/Admin';


/* lazy-load pages to keep bundles small */

export default function AppRouter() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/chat" element={<Overview />} />
                <Route path="/admin" element={<Admin />} />
            </Routes>
        </BrowserRouter>
    );
}
