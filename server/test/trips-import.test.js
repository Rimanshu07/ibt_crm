import test from 'node:test';
import assert from 'node:assert/strict';
import { importDetailsFromInput, importDetailsFromTrip, normalizeImportRef, sameImportDetails } from '../src/modules/trips/trips.import.js';

const input = {
  ref_id: ' web-101 ',
  trip_type: 'package',
  services: ['package'],
  destination_ids: [4],
  start_date: '2026-12-20',
  nights: '4',
  end_date: '2026-12-24',
  adults: '2',
  children_ages: ['8'],
  infants: '0',
  foc: '0',
  guest_salutation: 'Mr.',
  guest_name: 'Rahul Sharma',
  guest_phone: '+91 9876543210',
  guest_email: 'RAHUL@example.com',
  guest_city: 'Delhi',
  tags: ['Honeymoon'],
  notes: 'Houseboat',
};

test('normalizes import reference IDs by trimming and uppercasing', () => {
  assert.equal(normalizeImportRef(' web-101 '), 'WEB-101');
});

test('compares imported details after JSON, numeric, date, and email normalization', () => {
  const saved = importDetailsFromTrip({
    ...input,
    id: 501,
    trip_no: 1001,
    ref_id: 'WEB-101',
    services: '["package"]',
    destination_ids: '[4]',
    nights: 4,
    end_date: '2026-12-24T00:00:00.000Z',
    adults: 2,
    children_ages: '[8]',
    infants: 0,
    foc: 0,
    guest_email: 'rahul@example.com',
    tags: '["Honeymoon"]',
    stage: 'on_trip',
    created_at: '2026-11-20T10:39:00.000Z',
  });

  assert.equal(sameImportDetails(importDetailsFromInput(input), saved), true);
});

test('treats a changed travel date as different imported details', () => {
  const changed = { ...input, start_date: '2026-12-21', end_date: '2026-12-25' };
  assert.equal(sameImportDetails(importDetailsFromInput(input), importDetailsFromInput(changed)), false);
});
