/** Every module mounts here under /api/v1/<path>. */
import auth from './auth/auth.routes.js';
import meta from './meta/meta.routes.js';
import admin from './admin/admin.routes.js';
import organization from './organization/organization.routes.js';
import notifications from './notifications/notifications.routes.js';
import options from './options/options.routes.js';
import lookup from './lookup/lookup.routes.js';
import masters from './masters/masters.routes.js';
import suppliers from './suppliers/suppliers.routes.js';
import hotels from './hotels/hotels.routes.js';
import transport from './transport/transport.routes.js';
import activities from './activities/activities.routes.js';
import rates from './rates/rates.routes.js';
import trips from './trips/trips.routes.js';
import tasks from './tasks/tasks.routes.js';
import quotes from './quotes/quotes.routes.js';
import bookings from './bookings/bookings.routes.js';
import finance from './finance/finance.routes.js';
import reports from './reports/reports.routes.js';

export default [
  ['auth', auth], ['meta', meta], ['admin', admin], ['org', organization], ['notifications', notifications],
  ['options', options], ['lookup', lookup], ['masters', masters], ['suppliers', suppliers], ['hotels', hotels],
  ['transport', transport], ['activities', activities], ['rates', rates], ['trips', trips], ['tasks', tasks],
  ['quotes', quotes], ['bookings', bookings], ['finance', finance], ['reports', reports],
];
