/**
 * Permission catalogue. Each permission belongs to a feature: when the
 * Super Admin switches a feature off for an organisation, its permissions
 * disappear from that organisation (roles screen and API checks).
 * `feature: null` = always available.
 */
export const PERMISSIONS = [
  // Settings & users (always on)
  { code: 'settings.manage', group: 'Organisation', label: 'Edit organisation settings', feature: null },
  { code: 'users.manage', group: 'Organisation', label: 'Add and edit users', feature: null },
  { code: 'roles.manage', group: 'Organisation', label: 'Create and edit roles', feature: null },
  { code: 'billing.view', group: 'Organisation', label: 'See plan and billing', feature: null },

  // Sales
  { code: 'trips.view', group: 'Enquiries & Trips', label: 'View trips', feature: 'crm_leads' },
  { code: 'trips.create', group: 'Enquiries & Trips', label: 'Create enquiries', feature: 'crm_leads' },
  { code: 'trips.edit', group: 'Enquiries & Trips', label: 'Edit trips', feature: 'crm_leads' },
  { code: 'trips.view_all', group: 'Enquiries & Trips', label: "See everyone's trips", feature: 'crm_leads' },
  { code: 'trips.assign', group: 'Enquiries & Trips', label: 'Assign trips to staff', feature: 'crm_leads' },
  { code: 'tasks.manage', group: 'Enquiries & Trips', label: 'Add and complete tasks', feature: 'tasks' },
  { code: 'quotes.create', group: 'Quotes', label: 'Create and edit quotes', feature: 'quotes' },
  { code: 'quotes.view_cost', group: 'Quotes', label: 'See cost price and profit', feature: 'quotes' },
  { code: 'quotes.share', group: 'Quotes', label: 'Share quotes', feature: 'share_quotes' },
  { code: 'trips.convert', group: 'Quotes', label: 'Convert trips', feature: 'conversion' },

  // Services / bookings
  { code: 'hotel.book', group: 'Bookings', label: 'Hotel bookings', feature: 'hotel' },
  { code: 'transport.book', group: 'Bookings', label: 'Cab bookings', feature: 'transport' },
  { code: 'activity.book', group: 'Bookings', label: 'Activity bookings', feature: 'activity' },
  { code: 'flight.book', group: 'Bookings', label: 'Flight bookings', feature: 'flight' },
  { code: 'visa.book', group: 'Bookings', label: 'Visa applications', feature: 'visa' },
  { code: 'train.book', group: 'Bookings', label: 'Train bookings', feature: 'train' },
  { code: 'passport.book', group: 'Bookings', label: 'Passport applications', feature: 'passport' },
  { code: 'insurance.book', group: 'Bookings', label: 'Insurance policies', feature: 'insurance' },
  { code: 'land_package.book', group: 'Bookings', label: 'Land package bookings', feature: 'land_package' },
  { code: 'vouchers.generate', group: 'Bookings', label: 'Generate vouchers', feature: 'vouchers' },

  // Masters
  { code: 'masters.manage', group: 'Masters & Suppliers', label: 'Edit services, prices and suppliers', feature: null },
  { code: 'masters.import', group: 'Masters & Suppliers', label: 'Import / export data and upload prices', feature: 'import_export' },
  { code: 'suppliers.manage', group: 'Masters & Suppliers', label: 'Add and edit suppliers', feature: null },

  // Finance
  { code: 'payments.log', group: 'Finance', label: 'Log payments', feature: 'accounting' },
  { code: 'payments.verify', group: 'Finance', label: 'Verify payments', feature: 'payment_verification' },
  { code: 'invoices.manage', group: 'Finance', label: 'Create invoices', feature: 'proforma_invoice' },
  { code: 'accounts.view', group: 'Finance', label: 'View accounts and ledgers', feature: 'accounting' },

  // Reports
  { code: 'reports.sales', group: 'Reports', label: 'Sales reports', feature: 'sales_reports' },
  { code: 'reports.profit', group: 'Reports', label: 'Profit reports', feature: 'profit_reports' },
];

export const ALL_PERMISSION_CODES = PERMISSIONS.map((p) => p.code);

const pick = (...prefixes) =>
  // 'trips.' = every trips permission; 'trips.view' = exactly that one
  ALL_PERMISSION_CODES.filter((c) => prefixes.some((p) => (p.endsWith('.') ? c.startsWith(p) : c === p)));

/** Roles created automatically for every approved organisation. */
export const DEFAULT_ROLES = [
  { name: 'Admin', description: 'Full access to everything', scope: 'all', permissions: ALL_PERMISSION_CODES },
  { name: 'Sales Head', description: 'All trips, quotes and sales reports', scope: 'all',
    permissions: pick('trips.', 'tasks.', 'quotes.', 'reports.sales', 'reports.profit') },
  { name: 'Sales Executive', description: 'Own trips, quotes and follow-ups', scope: 'own',
    permissions: pick('trips.view', 'trips.create', 'trips.edit', 'tasks.', 'quotes.create', 'quotes.share') },
  { name: 'Reservation', description: 'Hotel, flight, train, visa, passport and insurance bookings', scope: 'all',
    permissions: pick('trips.view', 'trips.view_all', 'hotel.', 'land_package.', 'flight.', 'train.', 'visa.', 'passport.', 'insurance.', 'vouchers.', 'tasks.') },
  { name: 'Operation', description: 'Cabs, activities, vouchers', scope: 'all',
    permissions: pick('trips.view', 'trips.view_all', 'transport.', 'activity.', 'vouchers.', 'tasks.') },
  { name: 'Accountant', description: 'Payments, invoices, accounts and profit', scope: 'all',
    permissions: pick('trips.view', 'trips.view_all', 'payments.', 'invoices.', 'accounts.', 'reports.', 'quotes.view_cost') },
  { name: 'Data Operator', description: 'Masters, prices, suppliers and imports', scope: 'all',
    permissions: pick('masters.', 'suppliers.') },
  { name: 'Viewer', description: 'Read-only access to trips', scope: 'all',
    permissions: pick('trips.view', 'trips.view_all') },
];
