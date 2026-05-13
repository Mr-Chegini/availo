import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import {
  approveCallRequest,
  cancelCallRequest,
  type CallRequest,
  getCallRequests,
  markCallAsCalled,
  rejectCallRequest,
  updateAdminNote,
} from '../api/callRequestsApi';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(value));
}

export function AdminView() {
  const [callRequests, setCallRequests] = useState<CallRequest[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function loadCallRequests() {
    try {
      setMessage('');
      setIsLoading(true);

      const data = await getCallRequests();
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
    void loadCallRequests();
  }, []);

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
    setNotesById((current) => ({
      ...current,
      [callRequestId]: event.currentTarget.value,
    }));
  }

  async function handleSaveNote(callRequestId: string) {
    await runAction(
      () => updateAdminNote(callRequestId, notesById[callRequestId] ?? ''),
      'Admin note saved.',
    );
  }

  function handleReject(callRequestId: string) {
    if (!window.confirm('Are you sure you want to reject this request?')) {
      return;
    }

    void runAction(
      () => rejectCallRequest(callRequestId),
      'Call request rejected.',
    );
  }

  function handleCancel(callRequestId: string) {
    if (!window.confirm('Are you sure you want to cancel this call?')) {
      return;
    }

    void runAction(() => cancelCallRequest(callRequestId), 'Call canceled.');
  }

  return (
    <section className="page-card">
      <h1 className="page-title">Admin View</h1>
      <p className="page-description">
        Manage call requests, approval actions, call status, and internal notes.
      </p>

      <button
        className="primary-button"
        type="button"
        onClick={loadCallRequests}
        disabled={isLoading}
      >
        {isLoading ? 'Loading...' : 'Refresh requests'}
      </button>

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
                      () => approveCallRequest(callRequest.id),
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
                      () => markCallAsCalled(callRequest.id),
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
