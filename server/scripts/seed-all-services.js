/** Adds clearly labeled sample catalog data for every supported service. */
import { pool, query, transaction } from '../src/core/db.js';
import { DEFAULT_OPTIONS } from '../../shared/catalog.js';

const demoNote = 'DEMO sample data. Replace or delete before using for real bookings.';
const optionLists = [
  'cities', 'airlines', 'flight_classes', 'trip_ways', 'train_classes', 'train_quotas',
  'visa_types', 'visa_purposes', 'visa_entries', 'visa_countries', 'passport_types',
  'insurance_coverage', 'currencies', 'stars', 'land_package_basis',
];
const supplierLabels = {
  flight: 'Flight',
  train: 'Train',
  visa: 'Visa',
  passport: 'Passport',
  insurance: 'Insurance',
  land_package: 'Land Package',
};

async function ensureSupplier(conn, orgId, service) {
  const name = `DEMO - ${supplierLabels[service]} Partner`;
  const [rows] = await conn.execute(
    'SELECT id FROM suppliers WHERE org_id = ? AND name = ? LIMIT 1',
    [orgId, name]
  );
  if (rows[0]) return { id: rows[0].id, created: false };

  const [result] = await conn.execute(
    `INSERT INTO suppliers (org_id, name, kind, services, city, country, notes)
     VALUES (?, ?, 'Company', ?, 'DEMO City', 'DEMO Country', ?)`,
    [orgId, name, JSON.stringify([service]), demoNote]
  );
  return { id: result.insertId, created: true };
}

async function ensureMaster(conn, orgId, type, name, data) {
  const [rows] = await conn.execute(
    'SELECT id FROM master_records WHERE org_id = ? AND type = ? AND name = ? LIMIT 1',
    [orgId, type, name]
  );
  if (rows[0]) return { id: rows[0].id, created: false };

  const [result] = await conn.execute(
    'INSERT INTO master_records (org_id, type, name, data) VALUES (?, ?, ?, ?)',
    [orgId, type, name, JSON.stringify(data)]
  );
  return { id: result.insertId, created: true };
}

async function seedOrganisation(conn, org) {
  const counts = {
    suppliers: 0, cabTypes: 0, trains: 0, trainFares: 0,
    visas: 0, passports: 0, insurance: 0, landPackages: 0,
  };

  for (const key of optionLists) {
    for (const value of DEFAULT_OPTIONS[key] || []) {
      await conn.execute(
        'INSERT IGNORE INTO options (org_id, list_key, value) VALUES (?, ?, ?)',
        [org.id, key, value]
      );
    }
  }
  for (const [key, values] of Object.entries({
    stations: ['DEMO Central Station', 'DEMO City Junction'],
    insurers: ['DEMO Sample Insurer'],
  })) {
    for (const value of values) {
      await conn.execute(
        'INSERT IGNORE INTO options (org_id, list_key, value) VALUES (?, ?, ?)',
        [org.id, key, value]
      );
    }
  }

  const suppliers = {};
  for (const service of Object.keys(supplierLabels)) {
    const result = await ensureSupplier(conn, org.id, service);
    suppliers[service] = result.id;
    if (result.created) counts.suppliers++;
  }

  for (const cab of [
    { name: 'DEMO - Sample Sedan', seats: 4, child_age: 6, code: 'DEMO-SEDAN' },
    { name: 'DEMO - Sample SUV', seats: 6, child_age: 6, code: 'DEMO-SUV' },
  ]) {
    if ((await ensureMaster(conn, org.id, 'cab_type', cab.name, cab)).created) counts.cabTypes++;
  }

  const trains = [];
  for (const train of [
    {
      name: 'DEMO - Sample Intercity Express', number: 'DEMO-12001',
      from_station: 'DEMO Central Station', to_station: 'DEMO City Junction',
      departs: '08:00', arrives: '14:30', classes: ['2A', '3A', 'SL'], runs_on: 'Daily',
    },
    {
      name: 'DEMO - Sample Evening Express', number: 'DEMO-12002',
      from_station: 'DEMO City Junction', to_station: 'DEMO Central Station',
      departs: '16:00', arrives: '22:30', classes: ['3A', 'SL'], runs_on: 'Daily',
    },
  ]) {
    const result = await ensureMaster(conn, org.id, 'train', train.name, train);
    trains.push({ ...train, id: result.id });
    if (result.created) counts.trains++;
  }
  for (const train of trains) {
    const name = `${train.number} ${train.name} - 3A - DEMO`;
    const result = await ensureMaster(conn, org.id, 'train_fare', name, {
      train_id: train.id, travel_class: '3A', valid_from: '2026-01-01',
      valid_to: '2030-12-31', fare: 1850, service_fee: 150,
    });
    if (result.created) counts.trainFares++;
  }

  const visaSamples = [
    {
      name: 'DEMO - UAE Tourist E-Visa 30 Days', country: 'UAE', visa_type: 'E-Visa',
      purpose: 'Tourism', entries: 'Single', duration_days: 30, validity_days: 60,
      processing_days: 5, documents: ['Passport copy', 'Recent photograph'],
      cost_adult: 2500, cost_child: 2500, selling_adult: 3500, selling_child: 3500,
      supplier_id: suppliers.visa, valid_to: '2030-12-31',
    },
    {
      name: 'DEMO - Singapore Tourist Visa', country: 'Singapore', visa_type: 'E-Visa',
      purpose: 'Tourism', entries: 'Multiple', duration_days: 30, validity_days: 90,
      processing_days: 7, documents: ['Passport copy', 'Recent photograph', 'Travel itinerary'],
      cost_adult: 1800, cost_child: 1800, selling_adult: 2800, selling_child: 2800,
      supplier_id: suppliers.visa, valid_to: '2030-12-31',
    },
  ];
  for (const visa of visaSamples) {
    if ((await ensureMaster(conn, org.id, 'visa_service', visa.name, visa)).created) counts.visas++;
  }

  const passportSamples = [
    {
      name: 'DEMO - Passport Fresh Application Assistance', service_type: 'Fresh',
      processing_days: 30, documents: ['Identity proof', 'Address proof', 'Date of birth proof'],
      govt_fee: 1500, cost_price: 1800, selling_price: 2400, supplier_id: suppliers.passport,
    },
    {
      name: 'DEMO - Passport Renewal Assistance', service_type: 'Renewal',
      processing_days: 20, documents: ['Existing passport', 'Address proof', 'Recent photograph'],
      govt_fee: 1500, cost_price: 1750, selling_price: 2300, supplier_id: suppliers.passport,
    },
  ];
  for (const passport of passportSamples) {
    if ((await ensureMaster(conn, org.id, 'passport_service', passport.name, passport)).created) counts.passports++;
  }

  const insuranceSamples = [
    {
      name: 'DEMO - International Essential Plan', insurer: 'DEMO Sample Insurer',
      coverage: 'International', sum_insured: 50000, age_from: 1, age_to: 70,
      days_from: 1, days_to: 30, premium_cost: 650, premium_selling: 950,
      supplier_id: suppliers.insurance,
    },
    {
      name: 'DEMO - Domestic Travel Plan', insurer: 'DEMO Sample Insurer',
      coverage: 'Domestic', sum_insured: 100000, age_from: 1, age_to: 80,
      days_from: 1, days_to: 15, premium_cost: 250, premium_selling: 450,
      supplier_id: suppliers.insurance,
    },
  ];
  for (const plan of insuranceSamples) {
    if ((await ensureMaster(conn, org.id, 'insurance_plan', plan.name, plan)).created) counts.insurance++;
  }

  const packageSamples = [
    {
      name: 'DEMO - Bali 4 Night Standard Package', supplier_id: suppliers.land_package,
      destination: 'Bali (DPS)', country: 'Indonesia', nights: 4, hotel_category: '4',
      currency: 'INR', valid_from: '2026-01-01', valid_to: '2030-12-31',
      rate_adult_twin: 32000, rate_adult_single: 41000, rate_extra_adult: 22000,
      rate_child_bed: 18000, rate_child_nobed: 12000,
      inclusions: ['Hotel accommodation', 'Airport transfers', 'Daily breakfast'],
      exclusions: ['International airfare', 'Personal expenses'],
      itinerary: 'Day 1: Arrival and transfer\n\nDay 2: Island sightseeing\n\nDay 3: Leisure day\n\nDay 4: Local sightseeing\n\nDay 5: Departure',
    },
    {
      name: 'DEMO - Goa 3 Night Family Package', supplier_id: suppliers.land_package,
      destination: 'Goa (GOI)', country: 'India', nights: 3, hotel_category: '4',
      currency: 'INR', valid_from: '2026-01-01', valid_to: '2030-12-31',
      rate_adult_twin: 18000, rate_adult_single: 24000, rate_extra_adult: 12000,
      rate_child_bed: 9000, rate_child_nobed: 5000,
      inclusions: ['Hotel accommodation', 'Airport transfers', 'Daily breakfast'],
      exclusions: ['Airfare', 'Meals not listed'],
      itinerary: 'Day 1: Arrival and check-in\n\nDay 2: North Goa sightseeing\n\nDay 3: South Goa sightseeing\n\nDay 4: Departure',
    },
  ];
  for (const landPackage of packageSamples) {
    if ((await ensureMaster(conn, org.id, 'land_package', landPackage.name, landPackage)).created) counts.landPackages++;
  }

  return counts;
}

try {
  const orgs = await query(
    "SELECT id FROM organizations WHERE status = 'active' ORDER BY id"
  );
  const totals = {
    suppliers: 0, cabTypes: 0, trains: 0, trainFares: 0,
    visas: 0, passports: 0, insurance: 0, landPackages: 0,
  };
  for (const org of orgs) {
    const added = await transaction((conn) => seedOrganisation(conn, org));
    for (const [key, count] of Object.entries(added)) totals[key] += count;
  }
  console.log(`Checked ${orgs.length} active organisation(s): ${JSON.stringify(totals)}`);
} finally {
  await pool.end();
}
