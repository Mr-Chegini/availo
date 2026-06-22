import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createPublicBooking,
  getPublicBookingPage,
  getPublicEventTypeAvailability,
  type AvailabilitySlot,
  type PublicBookingConfirmation,
  type PublicBookingPage,
} from '../api/callRequestsApi';

function formatSlotTime(scheduledAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(scheduledAt));
}

function formatDateTime(scheduledAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(scheduledAt));
}

function buildManagePath(input: {
  hostSlug: string;
  eventTypeSlug: string;
  bookingId: string;
  token: string;
}): string {
  const path = [
    'booking-pages',
    input.hostSlug,
    'event-types',
    input.eventTypeSlug,
    'availability',
    'bookings',
    input.bookingId,
  ]
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const tokenQuery = `token=${encodeURIComponent(input.token)}`;

  return `/${path}?${tokenQuery}`;
}

export function PublicBookingPageView() {
  const { hostSlug } = useParams();
  const [page, setPage] = useState<PublicBookingPage | null>(null);
  const [selectedEventTypeSlug, setSelectedEventTypeSlug] = useState('');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [createdBooking, setCreatedBooking] =
    useState<PublicBookingConfirmation | null>(null);
  const [message, setMessage] = useState('');
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedEventType = useMemo(() => {
    return page?.eventTypes.find(
      (eventType) => eventType.slug === selectedEventTypeSlug,
    );
  }, [page?.eventTypes, selectedEventTypeSlug]);

  useEffect(() => {
    let isMounted = true;

    async function loadPage() {
      if (!hostSlug) {
        setMessage('This booking page link is missing a host.');
        setIsLoadingPage(false);
        return;
      }

      try {
        setMessage('');
        setIsLoadingPage(true);
        const loadedPage = await getPublicBookingPage(hostSlug);

        if (isMounted) {
          setPage(loadedPage);
          setSelectedEventTypeSlug(loadedPage.eventTypes[0]?.slug ?? '');
        }
      } catch (error) {
        if (isMounted) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Failed to load booking page.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingPage(false);
        }
      }
    }

    void loadPage();

    return () => {
      isMounted = false;
    };
  }, [hostSlug]);

  function handleEventTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedEventTypeSlug(event.currentTarget.value);
    setSlots([]);
    setSelectedSlot('');
    setCreatedBooking(null);
    setMessage('');
  }

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    setDate(event.currentTarget.value);
    setSlots([]);
    setSelectedSlot('');
    setCreatedBooking(null);
    setMessage('');
  }

  async function handleLoadAvailability() {
    if (!hostSlug || !selectedEventTypeSlug) {
      setMessage('Choose an event type first.');
      return;
    }

    if (!date) {
      setMessage('Choose a date first.');
      return;
    }

    try {
      setMessage('');
      setSelectedSlot('');
      setCreatedBooking(null);
      setIsLoadingAvailability(true);
      const availability = await getPublicEventTypeAvailability({
        hostSlug,
        eventTypeSlug: selectedEventTypeSlug,
        date,
      });

      setSlots(availability);

      if (availability.length === 0) {
        setMessage('No slots are available for this date.');
      } else if (availability.every((slot) => !slot.available)) {
        setMessage('All slots are reserved for this date.');
      }
    } catch (error) {
      setSlots([]);
      setMessage(
        error instanceof Error ? error.message : 'Failed to load availability.',
      );
    } finally {
      setIsLoadingAvailability(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!hostSlug || !selectedEventTypeSlug) {
      setMessage('Choose an event type first.');
      return;
    }

    if (!selectedSlot) {
      setMessage('Choose an available time slot.');
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedPhoneNumber = phoneNumber.trim();

    if (!trimmedEmail || !trimmedPhoneNumber) {
      setMessage('Email and phone number are required.');
      return;
    }

    try {
      setMessage('');
      setIsSubmitting(true);
      const booking = await createPublicBooking({
        hostSlug,
        eventTypeSlug: selectedEventTypeSlug,
        email: trimmedEmail,
        phoneNumber: trimmedPhoneNumber,
        scheduledAt: selectedSlot,
      });

      setCreatedBooking(booking);
      setEmail('');
      setPhoneNumber('');
      setSelectedSlot('');
      setMessage('Booking submitted.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to submit booking.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const timezone =
    selectedEventType?.availabilityTimezone ?? page?.host.timezone ?? 'UTC';
  const managePath =
    hostSlug && selectedEventTypeSlug && createdBooking
      ? buildManagePath({
          hostSlug,
          eventTypeSlug: selectedEventTypeSlug,
          bookingId: createdBooking.bookingId,
          token: createdBooking.cancellationToken,
        })
      : '';

  return (
    <section className="page-card">
      <h1 className="page-title">
        {page ? `Book with ${page.host.name}` : 'Book a time'}
      </h1>
      <p className="page-description">
        Select an event type, choose an available time, and enter your contact
        details.
      </p>

      {isLoadingPage && <p className="message">Loading booking page...</p>}

      {!isLoadingPage && page && (
        <>
          <div className="form-grid">
            <div className="form-row">
              <label className="form-label" htmlFor="eventType">
                Event type
              </label>
              <select
                className="form-input"
                id="eventType"
                value={selectedEventTypeSlug}
                onChange={handleEventTypeChange}
              >
                {page.eventTypes.map((eventType) => (
                  <option key={eventType.slug} value={eventType.slug}>
                    {eventType.title} - {eventType.durationMinutes} min
                  </option>
                ))}
              </select>
            </div>

            {selectedEventType && (
              <div className="selected-slot">
                <strong>{selectedEventType.title}</strong>
                <br />
                {selectedEventType.durationMinutes} minutes
                {selectedEventType.meetingLocation
                  ? ` - ${selectedEventType.meetingLocation}`
                  : ''}
                <br />
                {selectedEventType.requiresApproval
                  ? 'Requires host approval'
                  : 'Auto-confirmed'}
              </div>
            )}

            <div className="form-row">
              <label className="form-label" htmlFor="bookingDate">
                Date
              </label>
              <input
                className="form-input"
                id="bookingDate"
                type="date"
                value={date}
                onChange={handleDateChange}
              />
            </div>

            <button
              className="primary-button"
              type="button"
              onClick={handleLoadAvailability}
              disabled={isLoadingAvailability || !selectedEventTypeSlug}
            >
              {isLoadingAvailability ? 'Loading...' : 'Load availability'}
            </button>
          </div>

          <h2 className="section-title">Available slots</h2>

          {slots.length > 0 ? (
            <div className="slot-grid">
              {slots.map((slot) => (
                <button
                  key={slot.scheduledAt}
                  type="button"
                  disabled={!slot.available}
                  onClick={() => {
                    setSelectedSlot(slot.scheduledAt);
                    setCreatedBooking(null);
                  }}
                  className={[
                    'slot-button',
                    selectedSlot === slot.scheduledAt
                      ? 'slot-button-selected'
                      : '',
                    !slot.available ? 'slot-button-reserved' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {formatSlotTime(slot.scheduledAt, timezone)}
                  {slot.available ? '' : ' - reserved'}
                </button>
              ))}
            </div>
          ) : (
            <p>No slots loaded yet.</p>
          )}

          <h2 className="section-title">Your details</h2>

          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="form-row">
              <label className="form-label" htmlFor="publicBookingEmail">
                Email
              </label>
              <input
                className="form-input"
                id="publicBookingEmail"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="publicBookingPhone">
                Phone number
              </label>
              <input
                className="form-input"
                id="publicBookingPhone"
                type="tel"
                required
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.currentTarget.value)}
              />
            </div>

            <div className="selected-slot">
              <strong>Selected slot:</strong>{' '}
              {selectedSlot ? formatDateTime(selectedSlot, timezone) : 'None'}
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={isSubmitting || !selectedSlot}
            >
              {isSubmitting ? 'Submitting...' : 'Submit booking'}
            </button>
          </form>

          {createdBooking && (
            <div className="booking-success">
              <h2 className="booking-title">Booking submitted</h2>
              <p>
                {createdBooking.status === 'scheduled'
                  ? 'Your booking is confirmed.'
                  : 'Your booking request is waiting for host approval.'}
              </p>
              <p>
                {formatDateTime(createdBooking.scheduledAt, timezone)} -{' '}
                {createdBooking.eventType.title}
              </p>
              <Link className="primary-link" to={managePath}>
                Manage this booking
              </Link>
            </div>
          )}
        </>
      )}

      {!isLoadingPage && !page && (
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
