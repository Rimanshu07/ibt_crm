import { j } from '../../core/http.js';

export const normalizeImportRef = (value) => String(value ?? '').trim().toUpperCase();

const jsonArray = (value) => {
  const parsed = j(value, []);
  return Array.isArray(parsed) ? parsed : [];
};
const text = (value) => String(value ?? '').trim();
const date = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
};
const number = (value) => (value == null || value === '' ? null : Number(value));

export function importDetailsFromInput(b) {
  return {
    ref_id: normalizeImportRef(b.ref_id),
    trip_type: text(b.trip_type),
    services: jsonArray(b.services).map(String).sort(),
    destination_ids: jsonArray(b.destination_ids).map(Number).sort((x, y) => x - y),
    start_date: date(b.start_date),
    nights: number(b.nights),
    end_date: date(b.end_date),
    adults: number(b.adults),
    children_ages: jsonArray(b.children_ages).map(Number).sort((x, y) => x - y),
    infants: number(b.infants),
    foc: number(b.foc),
    guest_salutation: text(b.guest_salutation),
    guest_name: text(b.guest_name),
    guest_phone: text(b.guest_phone),
    guest_email: text(b.guest_email).toLowerCase(),
    guest_city: text(b.guest_city),
    tags: jsonArray(b.tags).map(String).sort(),
    notes: text(b.notes),
  };
}

export function importDetailsFromTrip(t) {
  return importDetailsFromInput({
    ...t,
    services: jsonArray(t.services),
    destination_ids: jsonArray(t.destination_ids),
    children_ages: jsonArray(t.children_ages),
    tags: jsonArray(t.tags),
  });
}

export const sameImportDetails = (left, right) => JSON.stringify(left) === JSON.stringify(right);
