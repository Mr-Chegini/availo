import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AdminView } from '../pages/AdminView';
import { UserView } from '../pages/UserView';

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <nav className="app-nav">
          <div className="app-brand">Call Reservation System</div>
          <Link className="nav-link" to="/user">
            User View
          </Link>
          <Link className="nav-link" to="/admin">
            Admin View
          </Link>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/user" replace />} />
          <Route path="/user" element={<UserView />} />
          <Route path="/admin" element={<AdminView />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;