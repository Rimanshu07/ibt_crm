-- IBT Travels CRM - seed data (features, plans, countries, currencies)
USE ibt_crm;

INSERT INTO currencies (code, name, symbol) VALUES
('INR','Indian Rupee','₹'),('USD','US Dollar','$'),('EUR','Euro','€'),('GBP','British Pound','£'),
('AED','UAE Dirham','AED'),('SGD','Singapore Dollar','S$'),('THB','Thai Baht','฿'),('MYR','Malaysian Ringgit','RM'),
('LKR','Sri Lankan Rupee','Rs'),('NPR','Nepalese Rupee','Rs'),('AUD','Australian Dollar','A$'),('CAD','Canadian Dollar','C$'),
('SAR','Saudi Riyal','SAR'),('IDR','Indonesian Rupiah','Rp'),('BDT','Bangladeshi Taka','৳'),('AZN','Azerbaijani Manat','₼');

INSERT INTO countries (code, name, dial_code, currency_code) VALUES
('IN','India','+91','INR'),('US','United States','+1','USD'),('GB','United Kingdom','+44','GBP'),
('AE','United Arab Emirates','+971','AED'),('SG','Singapore','+65','SGD'),('TH','Thailand','+66','THB'),
('MY','Malaysia','+60','MYR'),('LK','Sri Lanka','+94','LKR'),('NP','Nepal','+977','NPR'),('AU','Australia','+61','AUD'),
('CA','Canada','+1','CAD'),('SA','Saudi Arabia','+966','SAR'),('ID','Indonesia','+62','IDR'),('BD','Bangladesh','+880','BDT'),
('AZ','Azerbaijan','+994','AZN'),('DE','Germany','+49','EUR'),('FR','France','+33','EUR');

-- Feature catalogue: every module the Super Admin can switch on/off per organisation
INSERT INTO features (code, module, name, description, sort_order) VALUES
('crm_leads','Sales','Enquiries & Trips','Capture enquiries, track trips through stages',10),
('tasks','Sales','Tasks & Follow-ups','Follow-up reminders and comments on trips',11),
('quotes','Sales','Quote Builder','Build priced quotes with markup and tax',20),
('itinerary','Sales','Itinerary','Day-wise itinerary, inclusions and exclusions',21),
('share_quotes','Sales','Share Quotes','WhatsApp / email text, PDF and Word downloads',22),
('conversion','Sales','Trip Conversion','Convert a quote into a confirmed trip with instalments',23),
('hotel','Services','Hotels','Hotel masters, prices and bookings',30),
('transport','Services','Transport (Cabs)','Transport services, prices and cab bookings',31),
('activity','Services','Activities & Tickets','Activities, tickets and bookings',32),
('flight','Services','Flights','Flight details in quotes and flight bookings',33),
('visa','Services','Visa','Visa services, applications and status tracking',34),
('train','Services','Train','Train tickets in quotes and train bookings',35),
('passport','Services','Passport','Passport services and application tracking',36),
('insurance','Services','Travel Insurance','Insurance plans, premiums and policies',37),
('land_package','Services','Vendor Land Packages','Buy land packages from DMCs, add flights and margin',38),
('vouchers','Operations','Vouchers & Documents','Trip, hotel and activity vouchers',40),
('operations_calendar','Operations','Operations Calendar','Day-by-day view of cabs and guides',41),
('quote_booking_diff','Operations','Quote vs Booking Check','Flags bookings that differ from the quote',42),
('guest_documents','Operations','Guest Documents','Upload and track guest documents',43),
('accounting','Finance','Accounts & Payments','Instalments, payments, ledgers and transactions',50),
('payment_verification','Finance','Payment Verification','Second check by accountant on every payment',51),
('proforma_invoice','Finance','Proforma Invoice','Tax-ready proforma invoices',52),
('profit_reports','Finance','Profit Reports','Profit per trip and per period',53),
('sales_reports','Reports','Sales Reports','Revenue, leads, quotes and conversion reports',60),
('import_export','Data','Import / Export','Bulk import masters and export any list',70),
('data_drive','Data','Data Drive','Shared file storage',71),
('multi_currency','Settings','Multi-Currency','Quote and pay in currencies other than the base',80),
('api_access','Settings','Lead API','Website lead capture by API key',81);

INSERT INTO plans (id, name, description, currency, org_fee_monthly, user_fee_monthly, max_users, trial_days) VALUES
(1,'Starter','Small agencies: sales, quotes and core services','INR',1500,500,5,14),
(2,'Professional','DMCs and tour operators: every feature','INR',3000,800,NULL,14),
(3,'International','Every feature, billed in USD','USD',49,15,NULL,14);

-- Starter: core sales + hotel, transport, activity, vouchers, accounting
INSERT INTO plan_features (plan_id, feature_code)
SELECT 1, code FROM features WHERE code IN
('crm_leads','tasks','quotes','itinerary','share_quotes','conversion','hotel','transport','activity','vouchers','accounting','sales_reports','import_export');
-- Professional and International: everything
INSERT INTO plan_features (plan_id, feature_code) SELECT 2, code FROM features;
INSERT INTO plan_features (plan_id, feature_code) SELECT 3, code FROM features;
