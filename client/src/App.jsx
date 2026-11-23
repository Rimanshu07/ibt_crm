import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminShell, AppShell, Guard } from './core/layout/AppShell.jsx';
import Login from './modules/auth/Login.jsx';
import Register from './modules/auth/Register.jsx';
import AdminDashboard from './modules/admin/AdminDashboard.jsx';
import Organisations from './modules/admin/Organisations.jsx';
import OrganisationDetail from './modules/admin/OrganisationDetail.jsx';
import Plans from './modules/admin/Plans.jsx';
import Features from './modules/admin/Features.jsx';
import Billing from './modules/admin/Billing.jsx';
import Admins from './modules/admin/Admins.jsx';
import AuditLog from './modules/admin/AuditLog.jsx';
import Dashboard from './modules/dashboard/Dashboard.jsx';
import TripsList from './modules/trips/TripsList.jsx';
import TripDetail from './modules/trips/TripDetail.jsx';
import QuoteBuilder from './modules/trips/QuoteBuilder.jsx';
import Tasks from './modules/tasks/Tasks.jsx';
import BookingBoard from './modules/bookings/BookingBoard.jsx';
import Operations from './modules/bookings/Operations.jsx';
import Payments from './modules/accounting/Payments.jsx';
import Transactions from './modules/accounting/Transactions.jsx';
import Accounts from './modules/accounting/Accounts.jsx';
import Ledgers from './modules/accounting/Ledgers.jsx';
import SalesReport from './modules/accounting/SalesReport.jsx';
import CheckInOut from './modules/accounting/CheckInOut.jsx';
import QuoteDiff from './modules/accounting/QuoteDiff.jsx';
import Hotels from './modules/services/Hotels.jsx';
import HotelForm from './modules/services/HotelForm.jsx';
import HotelDetail from './modules/services/HotelDetail.jsx';
import Prices from './modules/services/Prices.jsx';
import UploadPrices from './modules/services/UploadPrices.jsx';
import Calculator from './modules/services/Calculator.jsx';
import Transport from './modules/services/Transport.jsx';
import Activities from './modules/services/Activities.jsx';
import Masters from './modules/services/Masters.jsx';
import ImportExport from './modules/services/ImportExport.jsx';
import Suppliers from './modules/suppliers/Suppliers.jsx';
import SupplierForm from './modules/suppliers/SupplierForm.jsx';
import SupplierDetail from './modules/suppliers/SupplierDetail.jsx';
import OrgSettings from './modules/organization/OrgSettings.jsx';
import Users from './modules/organization/Users.jsx';
import Roles from './modules/organization/Roles.jsx';
import PlanFeatures from './modules/organization/PlanFeatures.jsx';
import MyProfile from './modules/profile/MyProfile.jsx';
import Notifications from './modules/notifications/Notifications.jsx';

const G = (feature, perm, el) => <Guard feature={feature} perm={perm}>{el}</Guard>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/admin" element={<AdminShell />}>
        <Route index element={<AdminDashboard />} />
        <Route path="orgs" element={<Organisations />} />
        <Route path="orgs/:id" element={<OrganisationDetail />} />
        <Route path="plans" element={<Plans />} />
        <Route path="features" element={<Features />} />
        <Route path="billing" element={<Billing />} />
        <Route path="admins" element={<Admins />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>

      <Route path="/app" element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="trips" element={G('crm_leads', 'trips.view', <TripsList />)} />
        <Route path="trips/:id" element={G('crm_leads', 'trips.view', <TripDetail />)} />
        <Route path="trips/:id/quote" element={G('quotes', 'quotes.create', <QuoteBuilder />)} />
        <Route path="tasks" element={G('tasks', null, <Tasks />)} />
        <Route path="bookings/:service" element={<BookingBoard />} />
        <Route path="operations" element={<Operations />} />

        <Route path="accounting/payments" element={G('accounting', ['payments.log', 'accounts.view'], <Payments />)} />
        <Route path="accounting/transactions" element={G('accounting', 'accounts.view', <Transactions />)} />
        <Route path="accounting/accounts" element={G('accounting', 'accounts.view', <Accounts />)} />
        <Route path="accounting/ledgers" element={G('accounting', 'accounts.view', <Ledgers />)} />
        <Route path="accounting/sales-report" element={G('sales_reports', 'reports.sales', <SalesReport />)} />
        <Route path="accounting/quote-diff" element={G('quote_booking_diff', null, <QuoteDiff />)} />
        <Route path="reports" element={<Navigate to="/app/accounting/sales-report" replace />} />
        <Route path="reports/check-in-out" element={G(null, 'reports.sales', <CheckInOut />)} />

        <Route path="services/hotels" element={G('hotel', null, <Hotels />)} />
        <Route path="services/hotels/new" element={G('hotel', 'masters.manage', <HotelForm />)} />
        <Route path="services/hotels/:id" element={G('hotel', null, <HotelDetail />)} />
        <Route path="services/hotels/:id/edit" element={G('hotel', 'masters.manage', <HotelForm />)} />
        <Route path="services/prices/:service" element={<Prices />} />
        <Route path="services/prices/:service/upload" element={G(null, ['masters.import', 'masters.manage'], <UploadPrices />)} />
        <Route path="services/prices/:service/calculate" element={<Calculator />} />
        <Route path="services/transport" element={G('transport', null, <Transport />)} />
        <Route path="services/activities" element={G('activity', null, <Activities />)} />
        <Route path="services/masters/:type" element={<Masters />} />
        <Route path="services/import-export" element={G('import_export', 'masters.import', <ImportExport />)} />

        <Route path="suppliers" element={<Suppliers />} />
        <Route path="suppliers/new" element={G(null, ['suppliers.manage', 'masters.manage'], <SupplierForm />)} />
        <Route path="suppliers/:id" element={<SupplierDetail />} />
        <Route path="suppliers/:id/edit" element={G(null, ['suppliers.manage', 'masters.manage'], <SupplierForm />)} />

        <Route path="organization" element={G(null, 'settings.manage', <OrgSettings />)} />
        <Route path="users" element={G(null, 'users.manage', <Users />)} />
        <Route path="roles" element={G(null, 'roles.manage', <Roles />)} />
        <Route path="plan" element={G(null, 'billing.view', <PlanFeatures />)} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="*" element={<div className="page"><div className="card empty">Page not found.</div></div>} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
