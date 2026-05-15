import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import {
  type AvailabilitySlot,
  createCallRequest,
  getAvailability,
} from '../api/callRequestsApi';

// Turkey is permanently UTC+3 (no DST since 2016)
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

function getIstanbulTomorrow(): string {
  const istanbulNow = new Date(Date.now() + ISTANBUL_OFFSET_MS);
  istanbulNow.setUTCDate(istanbulNow.getUTCDate() + 1);
  return istanbulNow.toISOString().split('T')[0];
}

// Use UTC noon so the JS Date's UTC day matches the intended calendar day
// regardless of the user's local timezone.
function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function formatSlotTime(scheduledAt: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(scheduledAt));
}

export function UserView() {
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
    setDate(event.currentTarget.value);
    setSelectedSlot('');
    setSlots([]);
    setMessage('');
  }

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.currentTarget.value);
  }

  function handlePhoneNumberChange(event: ChangeEvent<HTMLInputElement>) {
    setPhoneNumber(event.currentTarget.value);
  }

  async function handleLoadAvailability() {
    if (!date) {
      setMessage('Please select a date first.');
      return;
    }

    if (isWeekend(date)) {
      setSlots([]);
      setMessage('Weekends are not available. Please pick a weekday (Mon–Fri).');
      return;
    }

    try {
      setMessage('');
      setSelectedSlot('');
      setIsLoadingAvailability(true);

      const availability = await getAvailability(date);
      setSlots(availability);

      if (availability.length === 0) {
        setMessage('No slots available for this date.');
      } else if (availability.every((s) => !s.available)) {
        setMessage('All slots are fully booked for this date.');
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

  async function loadSlotsForDate(d: string) {
    const availability = await getAvailability(d);
    setSlots(availability);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedPhoneNumber = phoneNumber.trim();

    if (!selectedSlot) {
      setMessage('Please select a time slot.');
      return;
    }

    if (!trimmedEmail) {
      setMessage('Email is required.');
      return;
    }

    if (!trimmedPhoneNumber) {
      setMessage('Phone number is required.');
      return;
    }

    try {
      setMessage('');
      setIsSubmitting(true);

      await createCallRequest({
        email: trimmedEmail,
        phoneNumber: trimmedPhoneNumber,
        scheduledAt: selectedSlot,
      });

      setMessage('Call request submitted successfully.');
      setEmail('');
      setPhoneNumber('');
      setSelectedSlot('');

      if (date) {
        await loadSlotsForDate(date);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Failed to submit call request.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const minDate = getIstanbulTomorrow();

  return (
    <section className="page-card">
      <h1 className="page-title">User View</h1>
      <p className="page-description">
        Choose a date, select an available 30-minute slot, and request a call.
        Only weekdays (Mon–Fri) between 10:00–18:00 Istanbul time (UTC+3) are
        available.
      </p>

      <div className="form-grid">
        <div className="form-row">
          <label className="form-label" htmlFor="date">
            Date
          </label>
          <input
            className="form-input"
            id="date"
            type="date"
            value={date}
            min={minDate}
            onChange={handleDateChange}
          />
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={handleLoadAvailability}
          disabled={isLoadingAvailability}
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
              onClick={() => setSelectedSlot(slot.scheduledAt)}
              className={[
                'slot-button',
                selectedSlot === slot.scheduledAt ? 'slot-button-selected' : '',
                !slot.available ? 'slot-button-reserved' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {formatSlotTime(slot.scheduledAt)}
              {slot.available ? '' : ' - reserved'}
            </button>
          ))}
        </div>
      ) : (
        <p>No slots loaded yet.</p>
      )}

      <h2 className="section-title">Reserve selected slot</h2>

      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="form-label" htmlFor="email">
            Email
          </label>
          <input
            className="form-input"
            id="email"
            type="email"
            required
            value={email}
            onChange={handleEmailChange}
          />
        </div>

        <div className="form-row">
          <label className="form-label" htmlFor="phoneNumber">
            Phone number
          </label>
          <input
            className="form-input"
            id="phoneNumber"
            type="tel"
            required
            value={phoneNumber}
            onChange={handlePhoneNumberChange}
          />
        </div>

        <div className="selected-slot">
          <strong>Selected slot:</strong>{' '}
          {selectedSlot ? formatSlotTime(selectedSlot) : 'None'}
        </div>

        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting || !selectedSlot}
        >
          {isSubmitting ? 'Submitting...' : 'Submit request'}
        </button>
      </form>

      {message && <p className="message">{message}</p>}
    </section>
  );
}
