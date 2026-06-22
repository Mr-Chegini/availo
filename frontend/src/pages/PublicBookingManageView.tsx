import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  cancelPublicBooking,
  getPublicBooking,
  type PublicBookingConfirmation,
  reschedulePublicBooking,
} from '../api/callRequestsApi';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(value));
}

function toIsoDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Please enter a valid date and time.');
  }

  return date.toISOString();
}

export function PublicBookingManageView() {
  const { hostSlug, eventTypeSlug, bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [booking, setBooking] = useState<PublicBookingConfirmation | null>(
    null,
  );
  const [message, setMessage] = useState('');
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);

  const routeInput = useMemo(() => {
    if (!hostSlug || !eventTypeSlug || !bookingId || !token) {
      return null;
    }

    return {
      hostSlug,
      eventTypeSlug,
      bookingId,
      token,
    };
  }, [bookingId, eventTypeSlug, hostSlug, token]);

  useEffect(() => {
    let isMounted = true;

    async function loadBooking() {
      if (!routeInput) {
        setMessage('This booking link is missing required information.');
        setIsLoading(false);
        return;
      }

      try {
        setMessage('');
        setIsLoading(true);
        const loadedBooking = await getPublicBooking(routeInput);

        if (isMounted) {
          setBooking(loadedBooking);
        }
      } catch (error) {
        if (isMounted) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Failed to load booking details.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadBooking();

    return () => {
      isMounted = false;
    };
  }, [routeInput]);

  async function handleCancel() {
    if (!routeInput) {
      setMessage('This booking link is missing required information.');
      return;
    }

    try {
      setMessage('');
      setIsCanceling(true);
      await cancelPublicBooking(routeInput);
      setBooking(await getPublicBooking(routeInput));
      setMessage('Booking canceled.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to cancel booking.',
      );
    } finally {
      setIsCanceling(false);
    }
  }

  async function handleReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!routeInput) {
      setMessage('This booking link is missing required information.');
      return;
    }

    if (!rescheduleAt) {
      setMessage('Choose a new date and time first.');
      return;
    }

    try {
      setMessage('');
      setIsRescheduling(true);
      const updatedBooking = await reschedulePublicBooking({
        ...routeInput,
        scheduledAt: toIsoDateTime(rescheduleAt),
      });

      setBooking(updatedBooking);
      setRescheduleAt('');
      setMessage('Booking rescheduled.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to reschedule booking.',
      );
    } finally {
      setIsRescheduling(false);
    }
  }

  const isCanceled = booking?.status === 'canceled';

  return (
    <section className="page-card">
      <h1 className="page-title">Manage booking</h1>
      <p className="page-description">
        Review your booking details or make a change using your secure booking
        link.
      </p>

      {isLoading && <p className="message">Loading booking details...</p>}

      {!isLoading && booking && (
        <>
          <div className="booking-summary">
            <div className="booking-summary-header">
              <div>
                <h2 className="booking-title">{booking.eventType.title}</h2>
                <p className="booking-subtitle">
                  {booking.eventType.durationMinutes} minute event
                </p>
              </div>
              <span className="status-badge">{booking.status}</span>
            </div>

            <dl className="booking-detail-grid">
              <div>
                <dt>Scheduled time</dt>
                <dd>{formatDateTime(booking.scheduledAt)}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{booking.email}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{booking.phoneNumber}</dd>
              </div>
              {booking.meetingLocation && (
                <div>
                  <dt>Location</dt>
                  <dd>{booking.meetingLocation}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="action-row">
            <button
              className="danger-button"
              type="button"
              onClick={handleCancel}
              disabled={isCanceling || isCanceled}
            >
              {isCanceling ? 'Canceling...' : 'Cancel booking'}
            </button>
          </div>

          <form className="reschedule-form" onSubmit={handleReschedule}>
            <div className="form-row">
              <label className="form-label" htmlFor="rescheduleAt">
                New date and time
              </label>
              <input
                className="form-input"
                id="rescheduleAt"
                type="datetime-local"
                value={rescheduleAt}
                onChange={(event) => setRescheduleAt(event.currentTarget.value)}
                disabled={isCanceled}
              />
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={isRescheduling || isCanceled}
            >
              {isRescheduling ? 'Rescheduling...' : 'Reschedule booking'}
            </button>
          </form>
        </>
      )}

      {!isLoading && !booking && (
        <p>
          <Link className="nav-link" to="/user">
            Return to booking
          </Link>
        </p>
      )}

      {message && <p className="message">{message}</p>}
    </section>
  );
}
