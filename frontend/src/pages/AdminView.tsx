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
        error instanceof Error ? error.message : 'Failed to load call requests.',
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

  return (
    <section>
      <h1>Admin View</h1>
      <p>Manage call requests and internal admin notes.</p>

      <button type="button" onClick={loadCallRequests} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Refresh'}
      </button>

      {message && <p>{message}</p>}

      {callRequests.length === 0 ? (
        <p>No call requests found.</p>
      ) : (
        <div style={{ display: 'grid', gap: '16px', marginTop: '16px' }}>
          {callRequests.map((callRequest) => (
            <article
              key={callRequest.id}
              style={{
                border: '1px solid #ddd',
                padding: '16px',
                borderRadius: '8px',
              }}
            >
              <h2>{callRequest.email}</h2>

              <p>
                <strong>Phone:</strong> {callRequest.phoneNumber}
              </p>

              <p>
                <strong>Scheduled at:</strong>{' '}
                {formatDateTime(callRequest.scheduledAt)}
              </p>

              <p>
                <strong>Status:</strong> {callRequest.status}
              </p>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
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
                  type="button"
                  disabled={callRequest.status !== 'REQUESTED'}
                  onClick={() =>
                    void runAction(
                      () => rejectCallRequest(callRequest.id),
                      'Call request rejected.',
                    )
                  }
                >
                  Reject
                </button>

                <button
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
                  type="button"
                  disabled={callRequest.status !== 'SCHEDULED'}
                  onClick={() =>
                    void runAction(
                      () => cancelCallRequest(callRequest.id),
                      'Call canceled.',
                    )
                  }
                >
                  Cancel
                </button>
              </div>

              <div style={{ marginTop: '12px' }}>
                <label htmlFor={`admin-note-${callRequest.id}`}>
                  Admin note
                </label>
                <br />
                <textarea
                  id={`admin-note-${callRequest.id}`}
                  rows={3}
                  style={{ width: '100%' }}
                  value={notesById[callRequest.id] ?? ''}
                  onChange={(event) => handleNoteChange(callRequest.id, event)}
                />
                <br />
                <button
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