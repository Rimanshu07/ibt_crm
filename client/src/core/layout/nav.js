import { SERVICES, SERVICE_ORDER, MASTER_TYPES } from '@shared/catalog.js';

/** Trips menu like Sembark: trips plus the sales-side reports. */
export const tripsMenu = () => [
  { title: 'Trips' },
  { to: '/app/trips', label: 'All Trips' },
  { to: '/app/trips?new=1', label: 'New Trip / Query', perm: 'trips.create' },
  { title: 'Reports' },
  { to: '/app/accounting/sales-report', label: 'Sales Reports', feature: 'sales_reports', perm: 'reports.sales' },
  { to: '/app/accounting/quote-diff', label: 'Quote Bookings Diff', feature: 'quote_booking_diff' },
  { to: '/app/reports/check-in-out', label: 'Trip Check In/Out Report', perm: 'reports.sales' },
  { title: 'Operations' },
  { to: '/app/operations?service=hotel', label: 'Hotel Check-In/Outs', feature: 'hotel' },
  { to: '/app/operations', label: 'Operational Bookings', feature: 'operations_calendar' },
];

/** Bookings menu: one board per service the organisation has, plus operations. */
export const bookingsMenu = () => [
  { title: 'Service Bookings' },
  ...SERVICE_ORDER.filter((s) => s !== 'other').map((s) => ({ to: `/app/bookings/${s}`, label: `${SERVICES[s].plural} Bookings`, icon: SERVICES[s].icon, feature: SERVICES[s].feature, service: s, perm: SERVICES[s].perm })),
  { to: '/app/bookings/other', label: 'Other Services', icon: '➕', service: 'other' },
  { title: 'Operations' },
  { to: '/app/operations?service=hotel', label: 'Hotel Check-In/Outs', feature: 'hotel' },
  { to: '/app/operations', label: 'Operations Calendar', feature: 'operations_calendar' },
  { to: '/app/accounting/quote-diff', label: 'Quote vs Booking Diff', feature: 'quote_booking_diff' },
  { to: '/app/tasks', label: 'Tasks & Follow-ups', feature: 'tasks' },
];

export const accountingMenu = () => [
  { title: 'Payments' },
  { to: '/app/accounting/payments?direction=in', label: 'Incoming Payments', perm: 'payments.log' },
  { to: '/app/accounting/payments?direction=out', label: 'Outgoing Payments', perm: 'payments.log' },
  { title: 'Accounts' },
  { to: '/app/accounting/transactions', label: 'Transactions', perm: 'accounts.view' },
  { to: '/app/accounting/accounts', label: 'Accounts (Bank / Cash)', perm: 'accounts.view' },
  { to: '/app/accounting/ledgers', label: 'Ledgers & Balances', perm: 'accounts.view' },
  { title: 'Reports' },
  { to: '/app/accounting/sales-report', label: 'Sales Report', feature: 'sales_reports', perm: 'reports.sales' },
  { to: '/app/accounting/quote-diff', label: 'Quote vs Booking', feature: 'quote_booking_diff' },
  { to: '/app/reports/check-in-out', label: 'Trip Check In/Out Report', perm: 'reports.sales' },
];

export const servicesMenu = () => [
  { title: 'Hotels', feature: 'hotel' },
  { to: '/app/services/hotels', label: 'Hotels', feature: 'hotel' },
  { to: '/app/services/prices/hotel', label: 'Hotel Prices', feature: 'hotel' },
  { title: 'Transport', feature: 'transport' },
  { to: '/app/services/transport', label: 'Transport Services', feature: 'transport' },
  { to: '/app/services/prices/transport', label: 'Transport Prices', feature: 'transport' },
  { to: '/app/services/masters/cab_type', label: 'Cab Types', feature: 'transport' },
  { title: 'Activities', feature: 'activity' },
  { to: '/app/services/activities', label: 'Travel Activities', feature: 'activity' },
  { to: '/app/services/prices/activity', label: 'Travel Activity Prices', feature: 'activity' },
  { title: 'Repository' },
  ...['destination', 'trip_source', 'tag'].map((t) => ({ to: `/app/services/masters/${t}`, label: MASTER_TYPES[t].plural, feature: MASTER_TYPES[t].feature })),
  { to: '/app/services/import-export', label: 'Import / Export', feature: 'import_export', perm: 'masters.import' },
  { title: 'More services' },
  ...['land_package', 'visa_service', 'train', 'train_fare', 'passport_service', 'insurance_plan'].map((t) => ({ to: `/app/services/masters/${t}`, label: MASTER_TYPES[t].plural, feature: MASTER_TYPES[t].feature })),
];

export const suppliersMenu = () => [
  { title: 'Suppliers' },
  { to: '/app/suppliers', label: 'All Suppliers' },
  { title: 'By service' },
  ...['transport', 'activity', 'hotel', 'land_package', 'visa', 'flight', 'train', 'passport', 'insurance'].map((s) => ({ to: `/app/suppliers?service=${s}`, label: s === 'land_package' ? 'Land Package Vendors (DMC)' : `${SERVICES[s].label} Suppliers`, feature: SERVICES[s].feature })),
];

export const profileMenu = () => [
  { to: '/app/profile', label: 'My Profile' },
  { to: '/app/notifications', label: 'Notifications' },
  { divider: true },
  { to: '/app/organization', label: 'Organization Settings', perm: 'settings.manage' },
  { to: '/app/users', label: 'Users', perm: 'users.manage' },
  { to: '/app/roles', label: 'Roles & Permissions', perm: 'roles.manage' },
  { to: '/app/plan', label: 'Plan & Features', perm: 'billing.view' },
];

export const ADMIN_MENU = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/orgs', label: 'Organisations' },
  { to: '/admin/plans', label: 'Plans & Pricing' },
  { to: '/admin/features', label: 'Feature Catalogue' },
  { to: '/admin/billing', label: 'Billing & Invoices' },
  { to: '/admin/admins', label: 'Super Admins' },
  { to: '/admin/audit', label: 'Audit Log' },
];
