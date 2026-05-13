import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { UserView } from '../pages/UserView';

export function App() {
  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px' }}>
      <nav
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
          borderBottom: '1px solid #ddd',
          paddingBottom: '12px',
        }}
      >
        <Link to="/user">User View</Link>
        <Link to="/admin">Admin View</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/user" replace />} />
        <Route path="/user" element={<UserView />} />
        <Route
          path="/admin"
          element={
            <section>
              <h1>Admin View</h1>
              <p>Admin dashboard will be implemented next.</p>
            </section>
          }
        />
      </Routes>
    </div>
  );
}

export default App;