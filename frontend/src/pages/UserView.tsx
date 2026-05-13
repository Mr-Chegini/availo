import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import {
  type AvailabilitySlot,
  createCallRequest,
  getAvailability,
} from '../api/callRequestsApi';

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

    try {
      setMessage('');
      setSelectedSlot('');
      setIsLoadingAvailability(true);

      const availability = await getAvailability(date);
      setSlots(availability);

      if (availability.length === 0) {
        setMessage('No available slots for this date.');
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to load availability.',
      );
    } finally {
      setIsLoadingAvailability(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSlot) {
      setMessage('Please select a time slot.');
      return;
    }

    try {
      setMessage('');
      setIsSubmitting(true);

      await createCallRequest({
        email,
        phoneNumber,
        scheduledAt: selectedSlot,
      });

      setMessage('Call request submitted successfully.');
      setEmail('');
      setPhoneNumber('');
      setSelectedSlot('');

      if (date) {
        const availability = await getAvailability(date);
        setSlots(availability);
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

  return (
    <section>
      <h1>User View</h1>
      <p>
        Choose a date, select an available 30-minute slot, and request a call.
      </p>

      <div>
        <label htmlFor="date">Date</label>
        <br />
        <input id="date" type="date" value={date} onChange={handleDateChange} />
        <button type="button" onClick={handleLoadAvailability}>
          {isLoadingAvailability ? 'Loading...' : 'Load availability'}
        </button>
      </div>

      <h2>Available slots</h2>

      {slots.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {slots.map((slot) => (
            <button
              key={slot.scheduledAt}
              type="button"
              disabled={!slot.available}
              onClick={() => setSelectedSlot(slot.scheduledAt)}
              style={{
                padding: '8px 12px',
                border:
                  selectedSlot === slot.scheduledAt
                    ? '2px solid black'
                    : '1px solid #ccc',
                opacity: slot.available ? 1 : 0.4,
                cursor: slot.available ? 'pointer' : 'not-allowed',
              }}
            >
              {formatSlotTime(slot.scheduledAt)}
              {slot.available ? '' : ' - reserved'}
            </button>
          ))}
        </div>
      )}

      <h2>Reserve selected slot</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={handleEmailChange}
          />
        </div>

        <div>
          <label htmlFor="phoneNumber">Phone number</label>
          <br />
          <input
            id="phoneNumber"
            type="tel"
            required
            value={phoneNumber}
            onChange={handlePhoneNumberChange}
          />
        </div>

        <div>
          <strong>Selected slot:</strong>{' '}
          {selectedSlot ? formatSlotTime(selectedSlot) : 'None'}
        </div>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit request'}
        </button>
      </form>

      {message && <p>{message}</p>}
    </section>
  );
}
