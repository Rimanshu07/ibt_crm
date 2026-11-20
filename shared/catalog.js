/**
 * IBT Travels CRM — single source of truth for services, masters and dropdowns.
 * Used by BOTH the API (validation, import/export, pricing) and the React app
 * (forms, tables, menus). Add a field here and it appears everywhere.
 *
 * Field types: text | textarea | number | date | time | select | multiselect | list | ref | boolean
 *   select / multiselect : every dropdown lets users "+ Create new" values (saved per organisation
 *                          in the `options` table under `list`). Add `strict: true` to forbid new values.
 *   list   = several free-text lines (CSV: separated by "|")
 *   ref    = id of a record (hotel, supplier, visa service...). Picker has "+ Create new" too.
 */

/* ------------------------------------------------------------------ */
/* Default values for "creatable" dropdown lists                       */
/* ------------------------------------------------------------------ */
export const DEFAULT_OPTIONS = {
  salutations: ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Master', 'Miss'],
  meal_plans: ['EP', 'CP', 'MAP', 'AP'],
  stars: ['1', '2', '3', '4', '5', 'Budget', 'Boutique', 'Resort', 'Homestay', 'Villa'],
  cities: [
    'Delhi (DEL)', 'Mumbai (BOM)', 'Bengaluru (BLR)', 'Chennai (MAA)', 'Kolkata (CCU)', 'Hyderabad (HYD)', 'Ahmedabad (AMD)',
    'Pune (PNQ)', 'Goa (GOI)', 'Jaipur (JAI)', 'Indore (IDR)', 'Bhopal (BHO)', 'Kochi (COK)', 'Srinagar (SXR)', 'Leh (IXL)',
    'Bagdogra (IXB)', 'Guwahati (GAU)', 'Port Blair (IXZ)', 'Varanasi (VNS)', 'Lucknow (LKO)', 'Chandigarh (IXC)', 'Amritsar (ATQ)',
    'Dubai (DXB)', 'Abu Dhabi (AUH)', 'Singapore (SIN)', 'Bangkok (BKK)', 'Phuket (HKT)', 'Kuala Lumpur (KUL)', 'Bali (DPS)',
    'Colombo (CMB)', 'Kathmandu (KTM)', 'Male (MLE)', 'Baku (GYD)', 'London (LHR)', 'Paris (CDG)', 'Zurich (ZRH)', 'New York (JFK)',
  ],
  airlines: ['IndiGo', 'Air India', 'Air India Express', 'Vistara', 'SpiceJet', 'Akasa Air', 'Emirates', 'Etihad', 'Qatar Airways',
    'Singapore Airlines', 'Thai Airways', 'AirAsia', 'Lufthansa', 'British Airways'],
  flight_classes: ['Economy', 'Premium Economy', 'Business', 'First'],
  trip_ways: ['One way', 'Return', 'Multi-city'],
  train_classes: ['1A', '2A', '3A', '3E', 'SL', 'CC', 'EC', '2S'],
  train_quotas: ['General', 'Tatkal', 'Premium Tatkal', 'Ladies', 'Senior Citizen'],
  stations: [],
  transport_services: ['Pickup', 'Drop', 'Transfer', 'Sightseeing', 'Full Day', 'Half Day', 'Excursion', 'Disposal'],
  cab_types: ['Sedan (Dzire/Etios)', 'SUV (Ertiga)', 'Innova', 'Innova Crysta', 'Tempo Traveller 12', 'Tempo Traveller 17', 'Coach 35', 'Wagon R'],
  visa_types: ['E-Visa', 'Sticker Visa', 'On-Arrival Visa', 'Transit Visa', 'Schengen Visa'],
  visa_purposes: ['Tourism', 'Business', 'Transit', 'Study', 'Medical', 'Family Visit'],
  visa_entries: ['Single', 'Double', 'Multiple'],
  visa_countries: ['UAE', 'Singapore', 'Thailand', 'Malaysia', 'Indonesia', 'Vietnam', 'Sri Lanka', 'Azerbaijan', 'UK', 'USA', 'Schengen'],
  passport_types: ['Fresh', 'Renewal', 'Tatkal', 'Minor', 'Police Clearance (PCC)'],
  insurance_coverage: ['Domestic', 'International', 'Schengen', 'Worldwide excl. USA', 'Worldwide incl. USA'],
  insurers: [],
  supplier_kinds: ['Company', 'Single driver', 'Agent', 'DMC', 'Hotel group', 'Consolidator'],
  source_kinds: ['B2B Agent', 'Direct', 'Website', 'Referral', 'Social Media', 'Walk-in', 'Repeat Client'],
  hotel_tags: ['Pending Reconfirmation', 'Payment due for Confirmation', 'Reconfirmed', 'Rooming list sent'],
  hotel_groups: [],
  payment_modes: ['Bank transfer', 'UPI', 'Cash', 'Card', 'Cheque', 'Payment link', 'Other'],
  currencies: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB', 'MYR', 'IDR', 'LKR', 'NPR', 'AZN'],
  land_package_basis: ['Per person', 'Total'],
  designations: ['Owner', 'Manager', 'Sales', 'Reservations', 'Operations', 'Accounts'],
};

/** Services a supplier can provide (fixed list). */
export const SUPPLIER_SERVICES = ['hotel', 'transport', 'activity', 'flight', 'train', 'visa', 'passport', 'insurance', 'land_package', 'other'];

/* ------------------------------------------------------------------ */
/* Generic masters (stored in master_records)                          */
/* Hotels, transport, activities and suppliers have their own modules. */
/* ------------------------------------------------------------------ */
export const MASTER_TYPES = {
  destination: {
    label: 'Destination', plural: 'Destinations', group: 'Repository', feature: null,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'country', label: 'Country', type: 'text' },
      { key: 'short_code', label: 'Short code', type: 'text', hint: 'e.g. MP, GOA' },
      { key: 'currency', label: 'Currency', type: 'select', list: 'currencies' },
    ],
  },
  trip_source: {
    label: 'Trip Source', plural: 'Trip Sources (Agents & Channels)', group: 'Repository', feature: 'crm_leads',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'kind', label: 'Type', type: 'select', list: 'source_kinds' },
      { key: 'contact_name', label: 'Contact person', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'commission_pct', label: 'Commission %', type: 'number' },
    ],
  },
  tag: {
    label: 'Tag', plural: 'Trip Tags', group: 'Repository', feature: null,
    fields: [{ key: 'name', label: 'Tag', type: 'text', required: true }],
  },
  cab_type: {
    label: 'Cab Type', plural: 'Cab Types', group: 'Transport', feature: 'transport',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, hint: 'e.g. Innova Crysta' },
      { key: 'seats', label: 'Passengers', type: 'number' },
      { key: 'child_age', label: 'Children counted from age', type: 'number' },
      { key: 'code', label: 'Internal code', type: 'text', hint: 'Never shared with customers' },
    ],
  },
  visa_service: {
    label: 'Visa Service', plural: 'Visa Services', group: 'Visa', feature: 'visa',
    fields: [
      { key: 'name', label: 'Visa name', type: 'text', required: true, hint: 'e.g. Dubai Tourist 30 days' },
      { key: 'country', label: 'Country', type: 'select', list: 'visa_countries', required: true },
      { key: 'visa_type', label: 'Type of visa', type: 'select', list: 'visa_types' },
      { key: 'purpose', label: 'Purpose', type: 'select', list: 'visa_purposes' },
      { key: 'entries', label: 'Entries', type: 'select', list: 'visa_entries' },
      { key: 'duration_days', label: 'Stay allowed (days)', type: 'number' },
      { key: 'validity_days', label: 'Visa valid for (days)', type: 'number' },
      { key: 'processing_days', label: 'Processing time (days)', type: 'number' },
      { key: 'documents', label: 'Documents required', type: 'list', hint: 'Passport | Photo | Bank statement' },
      { key: 'cost_adult', label: 'Cost per adult', type: 'number', required: true },
      { key: 'cost_child', label: 'Cost per child', type: 'number' },
      { key: 'selling_adult', label: 'Selling per adult', type: 'number' },
      { key: 'selling_child', label: 'Selling per child', type: 'number' },
      { key: 'supplier_id', label: 'Visa vendor', type: 'ref', ref: 'supplier', service: 'visa' },
      { key: 'valid_to', label: 'Rate valid until', type: 'date' },
    ],
  },
  train: {
    label: 'Train', plural: 'Trains', group: 'Train', feature: 'train',
    fields: [
      { key: 'name', label: 'Train name', type: 'text', required: true },
      { key: 'number', label: 'Train number', type: 'text', required: true },
      { key: 'from_station', label: 'From station', type: 'select', list: 'stations' },
      { key: 'to_station', label: 'To station', type: 'select', list: 'stations' },
      { key: 'departs', label: 'Departs', type: 'time' },
      { key: 'arrives', label: 'Arrives', type: 'time' },
      { key: 'classes', label: 'Classes', type: 'multiselect', list: 'train_classes' },
      { key: 'runs_on', label: 'Runs on', type: 'text', hint: 'Daily / Mon, Wed, Fri' },
    ],
  },
  train_fare: {
    label: 'Train Fare', plural: 'Train Fares', group: 'Train', feature: 'train',
    fields: [
      { key: 'train_id', label: 'Train', type: 'ref', ref: 'train', required: true },
      { key: 'travel_class', label: 'Class', type: 'select', list: 'train_classes', required: true },
      { key: 'valid_from', label: 'Valid from', type: 'date', required: true },
      { key: 'valid_to', label: 'Valid to', type: 'date', required: true },
      { key: 'fare', label: 'Fare per passenger', type: 'number', required: true },
      { key: 'service_fee', label: 'Your service fee per passenger', type: 'number' },
    ],
  },
  passport_service: {
    label: 'Passport Service', plural: 'Passport Services', group: 'Passport', feature: 'passport',
    fields: [
      { key: 'name', label: 'Service name', type: 'text', required: true },
      { key: 'service_type', label: 'Service type', type: 'select', list: 'passport_types' },
      { key: 'processing_days', label: 'Processing time (days)', type: 'number' },
      { key: 'documents', label: 'Documents required', type: 'list' },
      { key: 'govt_fee', label: 'Government fee', type: 'number' },
      { key: 'cost_price', label: 'Total cost per applicant', type: 'number', required: true },
      { key: 'selling_price', label: 'Selling per applicant', type: 'number' },
      { key: 'supplier_id', label: 'Passport agent', type: 'ref', ref: 'supplier', service: 'passport' },
    ],
  },
  insurance_plan: {
    label: 'Insurance Plan', plural: 'Insurance Plans', group: 'Insurance', feature: 'insurance',
    fields: [
      { key: 'name', label: 'Plan name', type: 'text', required: true },
      { key: 'insurer', label: 'Insurer', type: 'select', list: 'insurers', required: true },
      { key: 'coverage', label: 'Coverage', type: 'select', list: 'insurance_coverage' },
      { key: 'sum_insured', label: 'Sum insured', type: 'number' },
      { key: 'age_from', label: 'Age from', type: 'number' },
      { key: 'age_to', label: 'Age to', type: 'number' },
      { key: 'days_from', label: 'Trip days from', type: 'number' },
      { key: 'days_to', label: 'Trip days to', type: 'number' },
      { key: 'premium_cost', label: 'Premium cost per traveller', type: 'number', required: true },
      { key: 'premium_selling', label: 'Premium selling per traveller', type: 'number' },
      { key: 'supplier_id', label: 'Insurance vendor', type: 'ref', ref: 'supplier', service: 'insurance' },
    ],
  },
  land_package: {
    label: 'Land Package', plural: 'Vendor Land Packages', group: 'Land Packages', feature: 'land_package',
    fields: [
      { key: 'name', label: 'Package name', type: 'text', required: true, hint: 'e.g. Bali 4N Standard (DMC)' },
      { key: 'supplier_id', label: 'Vendor / DMC', type: 'ref', ref: 'supplier', service: 'land_package', required: true },
      { key: 'destination', label: 'Destination', type: 'select', list: 'cities', required: true },
      { key: 'country', label: 'Country', type: 'text' },
      { key: 'nights', label: 'Nights', type: 'number', required: true },
      { key: 'hotel_category', label: 'Hotel category', type: 'select', list: 'stars' },
      { key: 'currency', label: 'Vendor currency', type: 'select', list: 'currencies', default: 'INR' },
      { key: 'valid_from', label: 'Valid from', type: 'date' },
      { key: 'valid_to', label: 'Valid to', type: 'date' },
      { key: 'rate_adult_twin', label: 'Per adult (twin sharing)', type: 'number', required: true },
      { key: 'rate_adult_single', label: 'Per adult (single room)', type: 'number' },
      { key: 'rate_extra_adult', label: 'Extra adult (3rd in room)', type: 'number' },
      { key: 'rate_child_bed', label: 'Child with bed', type: 'number' },
      { key: 'rate_child_nobed', label: 'Child without bed', type: 'number' },
      { key: 'inclusions', label: 'Inclusions', type: 'list' },
      { key: 'exclusions', label: 'Exclusions', type: 'list' },
      { key: 'itinerary', label: 'Day-wise itinerary', type: 'textarea', hint: 'One day per paragraph (leave a blank line between days)' },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Services that can be enquired, quoted and booked                    */
/* dates: 'stay' needs start date + nights; 'date' needs a travel date; */
/*        'none' needs no dates (visa, passport).                       */
/* ------------------------------------------------------------------ */
const pax = (key = 'adults', label = 'Adults', def = 1) => ({ key, label, type: 'number', required: key === 'adults', default: def });

export const SERVICES = {
  hotel: {
    label: 'Hotel', plural: 'Hotels', icon: '🏨', feature: 'hotel', perm: 'hotel.book', dates: 'stay', priceLookup: true,
    quoteFields: [
      { key: 'day', label: 'Check-in night', type: 'number', required: true, default: 1, width: 1 },
      { key: 'nights', label: 'Nights', type: 'number', required: true, default: 1, width: 1 },
      { key: 'hotel_id', label: 'Hotel', type: 'ref', ref: 'hotel', required: true, width: 3 },
      { key: 'room_type', label: 'Room type', type: 'select', list: 'room_types', suggestFrom: 'room_types', required: true, width: 2 },
      { key: 'meal_plan', label: 'Meal plan', type: 'select', list: 'meal_plans', required: true, default: 'CP', width: 1 },
      { key: 'pax_per_room', label: 'Pax / room', type: 'number', required: true, default: 2, width: 1 },
      { key: 'rooms', label: 'Rooms', type: 'number', required: true, default: 1, width: 1 },
      { key: 'aweb', label: 'Adult extra bed', type: 'number', default: 0, width: 1 },
      { key: 'cweb', label: 'Child extra bed', type: 'number', default: 0, width: 1 },
      { key: 'cnb', label: 'Child no bed', type: 'number', default: 0, width: 1 },
    ],
    bookingFields: [
      { key: 'confirmation_no', label: 'Confirmation number', type: 'text' },
      { key: 'contact_person', label: 'Confirmed by (hotel contact)', type: 'text' },
      { key: 'tag', label: 'Tag', type: 'select', list: 'hotel_tags' },
      { key: 'special_request', label: 'Special requests', type: 'textarea' },
    ],
    statuses: [
      { key: 'initialized', label: 'Initialized' }, { key: 'in_progress', label: 'In Progress' },
      { key: 'on_hold', label: 'On Hold' }, { key: 'booked', label: 'Booked', done: true },
      { key: 'changed', label: 'Changed' }, { key: 'dropped', label: 'Dropped', closed: true },
    ],
  },
  transport: {
    label: 'Transport', plural: 'Transport', icon: '🚗', feature: 'transport', perm: 'transport.book', dates: 'stay', priceLookup: true,
    quoteFields: [
      { key: 'day', label: 'Day', type: 'number', required: true, default: 1, width: 1 },
      { key: 'transport_service_id', label: 'Service (A → B)', type: 'ref', ref: 'transport_service', required: true, width: 3 },
      { key: 'cab_type', label: 'Cab type', type: 'select', list: 'cab_types', required: true, width: 2 },
      { key: 'qty', label: 'No. of cabs', type: 'number', required: true, default: 1, width: 1 },
      { key: 'start_time', label: 'Start time', type: 'time', width: 1 },
      { key: 'pickup_point', label: 'Pickup point', type: 'text', width: 2 },
    ],
    bookingFields: [
      { key: 'driver_name', label: 'Driver name', type: 'text' },
      { key: 'driver_phone', label: 'Driver phone', type: 'text' },
      { key: 'vehicle_no', label: 'Vehicle number', type: 'text' },
      { key: 'start_time', label: 'Pickup time', type: 'time' },
      { key: 'pickup_point', label: 'Pickup point', type: 'text' },
    ],
    statuses: [
      { key: 'unassigned', label: 'Unassigned' }, { key: 'assigned', label: 'Assigned' },
      { key: 'confirmed', label: 'Confirmed', done: true }, { key: 'dropped', label: 'Dropped', closed: true },
    ],
  },
  activity: {
    label: 'Activity', plural: 'Activities', icon: '🎟️', feature: 'activity', perm: 'activity.book', dates: 'stay', priceLookup: true,
    quoteFields: [
      { key: 'day', label: 'Day', type: 'number', required: true, default: 1, width: 1 },
      { key: 'activity_service_id', label: 'Activity & ticket', type: 'ref', ref: 'activity_service', required: true, width: 3 },
      pax('adults', 'Adults', 1), pax('children', 'Children', 0),
      { key: 'slot', label: 'Time slot', type: 'select', list: 'slots', suggestFrom: 'slots', width: 1 },
    ],
    bookingFields: [{ key: 'ticket_ref', label: 'Ticket / booking reference', type: 'text' }, { key: 'slot', label: 'Time slot', type: 'text' }],
    statuses: [
      { key: 'unassigned', label: 'Unassigned' }, { key: 'assigned', label: 'Assigned' },
      { key: 'confirmed', label: 'Confirmed', done: true }, { key: 'dropped', label: 'Dropped', closed: true },
    ],
  },
  land_package: {
    label: 'Land Package', plural: 'Land Packages', icon: '🧳', feature: 'land_package', perm: 'land_package.book', dates: 'stay', priceLookup: true,
    quoteFields: [
      { key: 'day', label: 'Starts on day', type: 'number', required: true, default: 1, width: 1 },
      { key: 'land_package_id', label: 'Vendor package (optional)', type: 'ref', ref: 'land_package', width: 3 },
      { key: 'supplier_id', label: 'Vendor / DMC', type: 'ref', ref: 'supplier', service: 'land_package', required: true, width: 2 },
      { key: 'title', label: 'Package title', type: 'text', required: true, width: 3 },
      { key: 'nights', label: 'Nights', type: 'number', required: true, default: 1, width: 1 },
      { key: 'currency', label: 'Vendor currency', type: 'select', list: 'currencies', default: 'INR', width: 1 },
      { key: 'fx_rate', label: 'Exchange rate', type: 'number', default: 1, width: 1, hint: '1 vendor currency = ? your currency' },
      { key: 'adults_twin', label: 'Adults (twin)', type: 'number', default: 2, width: 1 },
      { key: 'rate_adult_twin', label: 'Rate / adult twin', type: 'number', default: 0, width: 1 },
      { key: 'adults_single', label: 'Adults (single)', type: 'number', default: 0, width: 1 },
      { key: 'rate_adult_single', label: 'Rate / single', type: 'number', default: 0, width: 1 },
      { key: 'extra_adults', label: 'Extra adults', type: 'number', default: 0, width: 1 },
      { key: 'rate_extra_adult', label: 'Rate / extra adult', type: 'number', default: 0, width: 1 },
      { key: 'child_bed', label: 'Child with bed', type: 'number', default: 0, width: 1 },
      { key: 'rate_child_bed', label: 'Rate / child bed', type: 'number', default: 0, width: 1 },
      { key: 'child_nobed', label: 'Child no bed', type: 'number', default: 0, width: 1 },
      { key: 'rate_child_nobed', label: 'Rate / child no bed', type: 'number', default: 0, width: 1 },
      { key: 'description', label: 'What the vendor includes', type: 'textarea', width: 6 },
    ],
    bookingFields: [
      { key: 'vendor_ref', label: 'Vendor reference', type: 'text' },
      { key: 'confirmation_no', label: 'Confirmation number', type: 'text' },
      { key: 'voucher_no', label: 'Vendor voucher number', type: 'text' },
    ],
    statuses: [
      { key: 'requested', label: 'Requested' }, { key: 'on_hold', label: 'On Hold' },
      { key: 'confirmed', label: 'Confirmed', done: true }, { key: 'cancelled', label: 'Cancelled', closed: true },
    ],
  },
  flight: {
    label: 'Flight', plural: 'Flights', icon: '✈️', feature: 'flight', perm: 'flight.book', dates: 'date', priceLookup: false,
    quoteFields: [
      { key: 'day', label: 'Day', type: 'number', required: true, default: 1, width: 1 },
      { key: 'trip_way', label: 'Trip', type: 'select', list: 'trip_ways', default: 'One way', width: 1 },
      { key: 'from_city', label: 'Origin city', type: 'select', list: 'cities', required: true, width: 2 },
      { key: 'to_city', label: 'Destination city', type: 'select', list: 'cities', required: true, width: 2 },
      { key: 'airline', label: 'Airline', type: 'select', list: 'airlines', width: 2 },
      { key: 'flight_no', label: 'Flight no.', type: 'text', width: 1 },
      { key: 'depart_date', label: 'Departure date', type: 'date', width: 2 },
      { key: 'depart_time', label: 'Departs', type: 'time', width: 1 },
      { key: 'arrive_time', label: 'Arrives', type: 'time', width: 1 },
      { key: 'travel_class', label: 'Class', type: 'select', list: 'flight_classes', default: 'Economy', width: 1 },
      pax('adults', 'Adults', 1), pax('children', 'Children', 0), pax('infants', 'Infants', 0),
      { key: 'fare_adult', label: 'Fare / adult', type: 'number', default: 0, width: 1 },
      { key: 'fare_child', label: 'Fare / child', type: 'number', default: 0, width: 1 },
      { key: 'fare_infant', label: 'Fare / infant', type: 'number', default: 0, width: 1 },
      { key: 'baggage', label: 'Baggage', type: 'text', width: 2, hint: '15kg + 7kg cabin' },
    ],
    bookingFields: [
      { key: 'pnr', label: 'PNR', type: 'text' },
      { key: 'ticket_numbers', label: 'Ticket numbers', type: 'text' },
    ],
    statuses: [
      { key: 'quoted', label: 'Quoted' }, { key: 'on_hold', label: 'On Hold' }, { key: 'ticketed', label: 'Ticketed', done: true },
      { key: 'cancelled', label: 'Cancelled', closed: true },
    ],
  },
  train: {
    label: 'Train', plural: 'Trains', icon: '🚆', feature: 'train', perm: 'train.book', dates: 'date', priceLookup: true,
    quoteFields: [
      { key: 'day', label: 'Day', type: 'number', required: true, default: 1, width: 1 },
      { key: 'train_id', label: 'Train', type: 'ref', ref: 'train', required: true, width: 3 },
      { key: 'from_station', label: 'From station', type: 'select', list: 'stations', width: 2 },
      { key: 'to_station', label: 'To station', type: 'select', list: 'stations', width: 2 },
      { key: 'travel_class', label: 'Class', type: 'select', list: 'train_classes', required: true, default: '3A', width: 1 },
      { key: 'quota', label: 'Quota', type: 'select', list: 'train_quotas', default: 'General', width: 1 },
      pax('adults', 'Adults', 1), pax('children', 'Children', 0),
    ],
    bookingFields: [
      { key: 'pnr', label: 'PNR', type: 'text' },
      { key: 'coach_berth', label: 'Coach / berth', type: 'text' },
      { key: 'waitlist_no', label: 'Waitlist / RAC no.', type: 'text' },
    ],
    statuses: [
      { key: 'quoted', label: 'Quoted' }, { key: 'waitlisted', label: 'Waitlisted / RAC' },
      { key: 'booked', label: 'Confirmed', done: true }, { key: 'cancelled', label: 'Cancelled', closed: true },
    ],
  },
  visa: {
    label: 'Visa', plural: 'Visa', icon: '🛂', feature: 'visa', perm: 'visa.book', dates: 'none', priceLookup: true, perGuest: true,
    quoteFields: [
      { key: 'visa_service_id', label: 'Visa', type: 'ref', ref: 'visa_service', required: true, width: 3 },
      pax('adults', 'Adult applicants', 1), pax('children', 'Child applicants', 0),
      { key: 'travel_date', label: 'Travel date (optional)', type: 'date', width: 2 },
    ],
    bookingFields: [
      { key: 'guest_name', label: 'Applicant name', type: 'text' },
      { key: 'passport_no', label: 'Passport no.', type: 'text' },
      { key: 'application_no', label: 'Application no.', type: 'text' },
      { key: 'appointment_date', label: 'Appointment date', type: 'date' },
      { key: 'visa_expiry', label: 'Visa expiry', type: 'date' },
    ],
    statuses: [
      { key: 'new', label: 'New' }, { key: 'document_pending', label: 'Document Pending' },
      { key: 'document_received', label: 'Document Received' }, { key: 'document_verified', label: 'Document Verified' },
      { key: 'appointment_scheduled', label: 'Appointment Scheduled' }, { key: 'appointment_done', label: 'Appointment Done' },
      { key: 'in_progress', label: 'In Progress' }, { key: 'approved', label: 'Approved', done: true },
      { key: 'rejected', label: 'Rejected', closed: true }, { key: 'dropped', label: 'Dropped', closed: true },
    ],
  },
  passport: {
    label: 'Passport', plural: 'Passport', icon: '📘', feature: 'passport', perm: 'passport.book', dates: 'none', priceLookup: true, perGuest: true,
    quoteFields: [
      { key: 'passport_service_id', label: 'Service', type: 'ref', ref: 'passport_service', required: true, width: 3 },
      pax('adults', 'Applicants', 1),
    ],
    bookingFields: [
      { key: 'guest_name', label: 'Applicant name', type: 'text' },
      { key: 'file_no', label: 'File number', type: 'text' },
      { key: 'appointment_date', label: 'PSK appointment', type: 'date' },
      { key: 'tracking_no', label: 'Dispatch tracking no.', type: 'text' },
    ],
    statuses: [
      { key: 'new', label: 'New' }, { key: 'document_pending', label: 'Document Pending' },
      { key: 'documents_verified', label: 'Documents Verified' }, { key: 'appointment_scheduled', label: 'Appointment Scheduled' },
      { key: 'appointment_done', label: 'Appointment Done' }, { key: 'police_verification', label: 'Police Verification' },
      { key: 'dispatched', label: 'Dispatched' }, { key: 'delivered', label: 'Delivered', done: true },
      { key: 'rejected', label: 'Rejected', closed: true },
    ],
  },
  insurance: {
    label: 'Travel Insurance', plural: 'Insurance', icon: '🛡️', feature: 'insurance', perm: 'insurance.book', dates: 'date', priceLookup: true,
    quoteFields: [
      { key: 'insurance_plan_id', label: 'Plan', type: 'ref', ref: 'insurance_plan', required: true, width: 3 },
      pax('adults', 'Travellers', 1),
      { key: 'days', label: 'Trip days', type: 'number', width: 1 },
      { key: 'ages', label: 'Ages', type: 'text', width: 2, hint: '34, 31, 6' },
    ],
    bookingFields: [
      { key: 'policy_no', label: 'Policy number', type: 'text' },
      { key: 'policy_start', label: 'Cover from', type: 'date' },
      { key: 'policy_end', label: 'Cover to', type: 'date' },
    ],
    statuses: [
      { key: 'quoted', label: 'Quoted' }, { key: 'issued', label: 'Issued', done: true },
      { key: 'claimed', label: 'Claimed', done: true }, { key: 'cancelled', label: 'Cancelled', closed: true },
    ],
  },
  other: {
    label: 'Other Service', plural: 'Other Services', icon: '➕', feature: null, perm: 'transport.book', dates: 'none', priceLookup: false,
    quoteFields: [
      { key: 'day', label: 'Day', type: 'number', default: 1, width: 1 },
      { key: 'description', label: 'Description', type: 'text', required: true, hint: 'e.g. Guide, special dinner', width: 3 },
      { key: 'qty', label: 'Quantity', type: 'number', default: 1, width: 1 },
      { key: 'unit_price', label: 'Price / unit', type: 'number', default: 0, width: 1 },
    ],
    bookingFields: [{ key: 'reference', label: 'Reference', type: 'text' }],
    statuses: [
      { key: 'pending', label: 'Pending' }, { key: 'confirmed', label: 'Confirmed', done: true },
      { key: 'dropped', label: 'Dropped', closed: true },
    ],
  },
};

export const SERVICE_ORDER = ['hotel', 'transport', 'activity', 'land_package', 'flight', 'train', 'visa', 'passport', 'insurance', 'other'];

/** What a customer can ask for on the enquiry form. "package" = hotel + transport + activity. */
export const ENQUIRY_SERVICES = [
  { key: 'package', label: 'Holiday package', icon: '🌴', includes: ['hotel', 'transport', 'activity'], dates: 'stay' },
  ...['hotel', 'transport', 'activity', 'land_package', 'flight', 'train', 'visa', 'passport', 'insurance']
    .map((k) => ({ key: k, label: SERVICES[k].label, icon: SERVICES[k].icon, feature: SERVICES[k].feature, includes: [k], dates: SERVICES[k].dates })),
];

/** The strictest date rule among the chosen enquiry services: 'stay' > 'date' > 'none'. */
export function datesNeeded(serviceKeys = []) {
  const rank = { none: 0, date: 1, stay: 2 };
  let best = 'none';
  for (const k of serviceKeys) {
    const d = ENQUIRY_SERVICES.find((s) => s.key === k)?.dates || SERVICES[k]?.dates || 'none';
    if (rank[d] > rank[best]) best = d;
  }
  return best;
}

export const TRIP_STAGES = [
  { key: 'new', label: 'New Query' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'quote_given', label: 'Quote Given' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'converted', label: 'Converted' },
  { key: 'on_trip', label: 'On Trip' },
  { key: 'past', label: 'Past Trips' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'dropped', label: 'Dropped' },
];

export const PRICING_STRATEGIES = [
  { key: 'overall', label: 'Overall – one markup on the total' },
  { key: 'per_component', label: 'Per component – markup per service' },
];

/** Events a payment preference can be based on. */
export const PAYMENT_EVENTS = [
  { key: 'booking_date', label: 'Booking Date' },
  { key: 'checkin_date', label: 'Checkin / Service Date' },
  { key: 'checkout_date', label: 'Checkout Date' },
  { key: 'booking_month_end', label: 'Booking Month End' },
  { key: 'checkout_month_end', label: 'Checkout Month End' },
  { key: 'trip_start', label: 'Trip Start Date' },
  { key: 'trip_end', label: 'Trip End Date' },
];

export const firstStatus = (service) => SERVICES[service]?.statuses[0]?.key;
export const isDoneStatus = (service, status) => Boolean(SERVICES[service]?.statuses.find((s) => s.key === status)?.done);
export const isClosedStatus = (service, status) => Boolean(SERVICES[service]?.statuses.find((s) => s.key === status)?.closed);
export const listKey = (field) => field.list || field.key;
