import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import {
  approveCallRequest,
  cancelCallRequest,
  type CallRequest,
  getCallRequests,
  loginAdmin,
  markCallAsCalled,
  rejectCallRequest,
  updateAdminNote,
} from '../api/callRequestsApi';

const ADMIN_SESSION_STORAGE_KEY = 'availo-admin-session';

interface AdminSession {
  accessToken: string;
  expiresAt: string;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(value));
}

export function AdminView() {
  const [session, setSession] = useState<AdminSession | null>(() =>
    readStoredAdminSession(),
  );
  const [callRequests, setCallRequests] = useState<CallRequest[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function loadCallRequests(activeSession = session) {
    if (!activeSession) {
      return;
    }

    try {
      setMessage('');
      setIsLoading(true);

      const data = await getCallRequests(activeSession.accessToken);
      setCallRequests(data);

      const nextNotesById = data.reduce<Record<string, string>>(
        (accumulator, callRequest) => {
          accumulator[callRequest.id] = callRequest.adminNote ?? '';
          return accumulator;
        },
        {},
      );

      setNotesById(nextNotesById);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to load call requests.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (session) {
      void loadCallRequests(session);
    }
  }, [session]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setMessage('Email and password are required.');
      return;
    }

    try {
      setMessage('');
      setIsLoggingIn(true);

      const result = await loginAdmin({
        email: trimmedEmail,
        password,
      });
      const nextSession = {
        accessToken: result.accessToken,
        expiresAt: result.expiresAt,
      };

      storeAdminSession(nextSession);
      setSession(nextSession);
      setPassword('');
    } catch (error) {
      setSession(null);
      clearStoredAdminSession();
      setMessage(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleLogout() {
    clearStoredAdminSession();
    setSession(null);
    setCallRequests([]);
    setNotesById({});
    setMessage('');
  }

  async function runAction(
    action: () => Promise<CallRequest>,
    successMessage: string,
  ) {
    try {
      setMessage('');

      await action();
      await loadCallRequests();

      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed.');
    }
  }

  function handleNoteChange(
    callRequestId: string,
    event: ChangeEvent<HTMLTextAreaElement>,
  ) {
    const nextAdminNote = event.currentTarget.value;

    setNotesById((current) => ({
      ...current,
      [callRequestId]: nextAdminNote,
    }));
  }

  async function handleSaveNote(callRequestId: string) {
    if (!session) {
      return;
    }

    await runAction(
      () =>
        updateAdminNote(
          session.accessToken,
          callRequestId,
          notesById[callRequestId] ?? '',
        ),
      'Admin note saved.',
    );
  }

  function handleReject(callRequestId: string) {
    if (!session) {
      return;
    }

    if (!window.confirm('Are you sure you want to reject this request?')) {
      return;
    }

    void runAction(
      () => rejectCallRequest(session.accessToken, callRequestId),
      'Call request rejected.',
    );
  }

  function handleCancel(callRequestId: string) {
    if (!session) {
      return;
    }

    if (!window.confirm('Are you sure you want to cancel this call?')) {
      return;
    }

    void runAction(
      () => cancelCallRequest(session.accessToken, callRequestId),
      'Call canceled.',
    );
  }

  if (!session) {
    return (
      <section className="page-card">
        <h1 className="page-title">Admin View</h1>

        <form className="form-grid" onSubmit={handleLogin}>
          <div className="form-row">
            <label className="form-label" htmlFor="admin-email">
              Email
            </label>
            <input
              className="form-input"
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="admin-password">
              Password
            </label>
            <input
              className="form-input"
              id="admin-password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </div>

          <button
            className="primary-button"
            type="submit"
            disabled={isLoggingIn}
          >
            {isLoggingIn ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {message && <p className="message">{message}</p>}
      </section>
    );
  }

  return (
    <section className="page-card">
      <h1 className="page-title">Admin View</h1>
      <p className="page-description">
        Manage call requests, approval actions, call status, and internal notes.
      </p>

      <div className="action-row">
        <button
          className="primary-button"
          type="button"
          onClick={() => void loadCallRequests()}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Refresh requests'}
        </button>

        <button
          className="secondary-button"
          type="button"
          onClick={handleLogout}
        >
          Sign out
        </button>
      </div>

      {message && <p className="message">{message}</p>}

      {callRequests.length === 0 ? (
        <p style={{ marginTop: '20px' }}>No call requests found.</p>
      ) : (
        <div className="admin-list">
          {callRequests.map((callRequest) => (
            <article key={callRequest.id} className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h2 className="admin-card-title">{callRequest.email}</h2>
                  <p style={{ margin: '6px 0 0', color: '#6b7280' }}>
                    {callRequest.phoneNumber}
                  </p>
                </div>

                <span className="status-badge">{callRequest.status}</span>
              </div>

              <p>
                <strong>Scheduled at:</strong>{' '}
                {formatDateTime(callRequest.scheduledAt)}
              </p>

              <p>
                <strong>Created at:</strong>{' '}
                {formatDateTime(callRequest.createdAt)}
              </p>

              <div className="action-row">
                <button
                  className="primary-button"
                  type="button"
                  disabled={callRequest.status !== 'REQUESTED'}
                  onClick={() =>
                    void runAction(
                      () =>
                        approveCallRequest(session.accessToken, callRequest.id),
                      'Call request approved.',
                    )
                  }
                >
                  Approve
                </button>

                <button
                  className="danger-button"
                  type="button"
                  disabled={callRequest.status !== 'REQUESTED'}
                  onClick={() => handleReject(callRequest.id)}
                >
                  Reject
                </button>

                <button
                  className="secondary-button"
                  type="button"
                  disabled={callRequest.status !== 'SCHEDULED'}
                  onClick={() =>
                    void runAction(
                      () =>
                        markCallAsCalled(session.accessToken, callRequest.id),
                      'Call marked as called.',
                    )
                  }
                >
                  Mark as called
                </button>

                <button
                  className="danger-button"
                  type="button"
                  disabled={callRequest.status !== 'SCHEDULED'}
                  onClick={() => handleCancel(callRequest.id)}
                >
                  Cancel
                </button>
              </div>

              <div className="form-row" style={{ marginTop: '16px' }}>
                <label
                  className="form-label"
                  htmlFor={`admin-note-${callRequest.id}`}
                >
                  Admin note
                </label>

                <textarea
                  className="form-textarea"
                  id={`admin-note-${callRequest.id}`}
                  rows={3}
                  value={notesById[callRequest.id] ?? ''}
                  onChange={(event) => handleNoteChange(callRequest.id, event)}
                />

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleSaveNote(callRequest.id)}
                >
                  Save note
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function readStoredAdminSession(): AdminSession | null {
  const rawSession = window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession) as AdminSession;

    if (
      !session.accessToken ||
      !session.expiresAt ||
      new Date(session.expiresAt) <= new Date()
    ) {
      clearStoredAdminSession();
      return null;
    }

    return session;
  } catch {
    clearStoredAdminSession();
    return null;
  }
}

function storeAdminSession(session: AdminSession): void {
  window.sessionStorage.setItem(
    ADMIN_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
}

function clearStoredAdminSession(): void {
  window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}
