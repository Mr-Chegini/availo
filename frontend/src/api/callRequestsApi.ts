const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export interface CallRequest {
  id: string;
  email: string;
  phoneNumber: string;
  scheduledAt: string;
  status: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilitySlot {
  scheduledAt: string;
  available: boolean;
}

export interface PublicBookingConfirmation {
  bookingId: string;
  email: string;
  phoneNumber: string;
  scheduledAt: string;
  status: string;
  cancellationToken: string;
  meetingLocation?: string;
  eventType: {
    slug: string;
    title: string;
    durationMinutes: number;
    meetingLocation?: string;
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      const errorBody = (await response.json()) as {
        message?: string | string[];
        error?: string;
      };

      const message = Array.isArray(errorBody.message)
        ? errorBody.message.join(', ')
        : errorBody.message || errorBody.error || 'Request failed';

      throw new Error(message);
    }

    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

export async function getAvailability(
  date: string,
): Promise<AvailabilitySlot[]> {
  const response = await fetch(
    `${API_BASE_URL}/call-requests/availability?date=${date}`,
  );

  return parseJsonResponse<AvailabilitySlot[]>(response);
}

export async function createCallRequest(input: {
  email: string;
  phoneNumber: string;
  scheduledAt: string;
}): Promise<CallRequest> {
  const response = await fetch(`${API_BASE_URL}/call-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseJsonResponse<CallRequest>(response);
}

export async function getCallRequests(): Promise<CallRequest[]> {
  const response = await fetch(`${API_BASE_URL}/call-requests`);

  return parseJsonResponse<CallRequest[]>(response);
}

export async function approveCallRequest(id: string): Promise<CallRequest> {
  const response = await fetch(`${API_BASE_URL}/call-requests/${id}/approve`, {
    method: 'PATCH',
  });

  return parseJsonResponse<CallRequest>(response);
}

export async function rejectCallRequest(id: string): Promise<CallRequest> {
  const response = await fetch(`${API_BASE_URL}/call-requests/${id}/reject`, {
    method: 'PATCH',
  });

  return parseJsonResponse<CallRequest>(response);
}

export async function markCallAsCalled(id: string): Promise<CallRequest> {
  const response = await fetch(`${API_BASE_URL}/call-requests/${id}/called`, {
    method: 'PATCH',
  });

  return parseJsonResponse<CallRequest>(response);
}

export async function cancelCallRequest(id: string): Promise<CallRequest> {
  const response = await fetch(`${API_BASE_URL}/call-requests/${id}/cancel`, {
    method: 'PATCH',
  });

  return parseJsonResponse<CallRequest>(response);
}

export async function updateAdminNote(
  id: string,
  adminNote: string,
): Promise<CallRequest> {
  const response = await fetch(
    `${API_BASE_URL}/call-requests/${id}/admin-note`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ adminNote }),
    },
  );

  return parseJsonResponse<CallRequest>(response);
}

function buildPublicBookingBasePath(input: {
  hostSlug: string;
  eventTypeSlug: string;
  bookingId: string;
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

  return `${API_BASE_URL}/${path}`;
}

function buildPublicBookingUrl(
  input: {
    hostSlug: string;
    eventTypeSlug: string;
    bookingId: string;
    token: string;
  },
  action?: 'cancel' | 'reschedule',
): string {
  const basePath = buildPublicBookingBasePath(input);
  const actionPath = action ? `/${action}` : '';
  const tokenQuery = `token=${encodeURIComponent(input.token)}`;

  return `${basePath}${actionPath}?${tokenQuery}`;
}

export async function getPublicBooking(input: {
  hostSlug: string;
  eventTypeSlug: string;
  bookingId: string;
  token: string;
}): Promise<PublicBookingConfirmation> {
  const response = await fetch(buildPublicBookingUrl(input));

  return parseJsonResponse<PublicBookingConfirmation>(response);
}

export async function cancelPublicBooking(input: {
  hostSlug: string;
  eventTypeSlug: string;
  bookingId: string;
  token: string;
}): Promise<CallRequest> {
  const response = await fetch(buildPublicBookingUrl(input, 'cancel'), {
    method: 'POST',
  });

  return parseJsonResponse<CallRequest>(response);
}

export async function reschedulePublicBooking(input: {
  hostSlug: string;
  eventTypeSlug: string;
  bookingId: string;
  token: string;
  scheduledAt: string;
}): Promise<PublicBookingConfirmation> {
  const response = await fetch(buildPublicBookingUrl(input, 'reschedule'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scheduledAt: input.scheduledAt }),
  });

  return parseJsonResponse<PublicBookingConfirmation>(response);
}
