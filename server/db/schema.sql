-- IBT Travels CRM - full schema (MySQL 8)
-- Run: mysql -u root -p < server/db/schema.sql

CREATE DATABASE IF NOT EXISTS ibt_crm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ibt_crm;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS attachments, notifications, rate_uploads, rates, activity_services, activities, transport_services, hotel_closures, hotels,
  suppliers, org_content, payment_preferences, org_templates, org_bank_accounts, org_offices, options, admin_notes, platform_invoices,
  transactions, instalments, bookings, quote_items, quotes, tasks, trip_logs, trips, trip_counters, master_records,
  audit_logs, user_roles, role_permissions, roles, users,
  org_features, plan_features, features, organizations, plans,
  tax_types, currencies, countries;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------- Global masters ----------
CREATE TABLE countries (
  code CHAR(2) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  dial_code VARCHAR(8) NOT NULL,
  currency_code CHAR(3) NOT NULL
);

CREATE TABLE currencies (
  code CHAR(3) PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  symbol VARCHAR(8) NOT NULL
);

-- ---------- Plans & features (platform) ----------
CREATE TABLE plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  org_fee_monthly DECIMAL(12,2) NOT NULL DEFAULT 0,   -- charged per organisation
  user_fee_monthly DECIMAL(12,2) NOT NULL DEFAULT 0,  -- charged per active user
  max_users INT NULL,                                  -- NULL = unlimited
  trial_days INT NOT NULL DEFAULT 14,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE features (
  code VARCHAR(50) PRIMARY KEY,
  module VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE plan_features (
  plan_id INT NOT NULL,
  feature_code VARCHAR(50) NOT NULL,
  PRIMARY KEY (plan_id, feature_code),
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  FOREIGN KEY (feature_code) REFERENCES features(code) ON DELETE CASCADE
);

-- ---------- Organisations (tenants) ----------
CREATE TABLE organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  legal_name VARCHAR(200),
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  country_code CHAR(2) NOT NULL,
  city VARCHAR(100),
  address VARCHAR(255),
  tax_id VARCHAR(50),                 -- GSTIN / VAT / TRN
  base_currency CHAR(3) NOT NULL DEFAULT 'INR',
  timezone VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
  default_tax_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  brand_prefix VARCHAR(10),
  logo_url MEDIUMTEXT,                -- image URL or data URL
  website VARCHAR(150),
  state VARCHAR(100),
  pincode VARCHAR(20),
  pan VARCHAR(20),
  branding JSON NULL,                 -- {primary_color, header:{mode,title,subtitle,align,show_logo}, footer:{text}}
  header_image MEDIUMTEXT,            -- letter-head banner for PDFs (data URL)
  footer_image MEDIUMTEXT,
  plan_id INT NULL,
  user_fee_override DECIMAL(12,2) NULL,
  org_fee_override DECIMAL(12,2) NULL,
  status ENUM('pending','active','rejected','suspended') NOT NULL DEFAULT 'pending',
  status_reason VARCHAR(255),
  trial_ends_at DATE NULL,
  approved_at DATETIME NULL,
  approved_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_email (email),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE org_features (
  org_id INT NOT NULL,
  feature_code VARCHAR(50) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, feature_code),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (feature_code) REFERENCES features(code) ON DELETE CASCADE
);

CREATE TABLE tax_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  name VARCHAR(60) NOT NULL,          -- GST, VAT, Service Tax...
  rate DECIMAL(5,2) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- ---------- Users & roles ----------
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NULL,                    -- NULL for platform (super admin) users
  is_super_admin TINYINT(1) NOT NULL DEFAULT 0,
  is_org_owner TINYINT(1) NOT NULL DEFAULT 0,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  designation VARCHAR(80),
  password_hash VARCHAR(100) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_email (email),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(255),
  scope ENUM('own','team','all') NOT NULL DEFAULT 'all',
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_role (org_id, name),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE role_permissions (
  role_id INT NOT NULL,
  permission VARCHAR(60) NOT NULL,
  PRIMARY KEY (role_id, permission),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- ---------- Audit ----------
CREATE TABLE audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NULL,
  user_id INT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(50),
  target_id VARCHAR(50),
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_org (org_id, created_at)
);

-- =====================================================================
-- Organisation set-up
-- =====================================================================
CREATE TABLE options (                 -- "+ Create new" values for every dropdown
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  list_key VARCHAR(60) NOT NULL,
  value VARCHAR(150) NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_option (org_id, list_key, value),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE org_offices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(500),
  city VARCHAR(100), state VARCHAR(100), country VARCHAR(100), pincode VARCHAR(20),
  phone VARCHAR(40), email VARCHAR(150), tax_id VARCHAR(50),
  is_head TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE org_bank_accounts (       -- also the "payment accounts" money moves through
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  kind ENUM('bank','cash','upi','card','gateway') NOT NULL DEFAULT 'bank',
  name VARCHAR(120) NOT NULL,          -- display name e.g. "HDFC Current"
  bank_name VARCHAR(120), account_name VARCHAR(150), account_no VARCHAR(60),
  ifsc VARCHAR(30), swift VARCHAR(30), branch VARCHAR(150), upi_id VARCHAR(100),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  show_on_docs TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE org_templates (            -- quote email, quote PDF, invoice, vouchers...
  org_id INT NOT NULL,
  tkey VARCHAR(40) NOT NULL,
  subject VARCHAR(255),
  body MEDIUMTEXT,
  settings JSON NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, tkey),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE payment_preferences (      -- e.g. 50% on Booking Date, 50% 15 days before Checkin
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  kind ENUM('supplier','customer') NOT NULL,
  service VARCHAR(20) NOT NULL DEFAULT 'all',
  name VARCHAR(255) NOT NULL,
  parts JSON NOT NULL,                  -- [{event, offset_days, pct}]
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE org_content (              -- inclusions/exclusions and T&C per service
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  kind ENUM('inc_exc','tnc') NOT NULL,
  service VARCHAR(20) NOT NULL DEFAULT 'general',
  title VARCHAR(150) NOT NULL,
  inclusions JSON NULL,
  exclusions JSON NULL,
  body MEDIUMTEXT,
  is_default TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- =====================================================================
-- Masters, suppliers and services
-- =====================================================================
CREATE TABLE master_records (          -- generic masters: destinations, sources, visa, trains, passport, insurance, land packages...
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  type VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  data JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_master (org_id, type, name),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  kind VARCHAR(40) NOT NULL DEFAULT 'Company',
  services JSON NOT NULL,              -- ["transport","activity",...]
  email VARCHAR(150), phone VARCHAR(40),
  address VARCHAR(500), city VARCHAR(100), state VARCHAR(100), country VARCHAR(100),
  tax_id VARCHAR(50), pan VARCHAR(20),
  contacts JSON NULL,                  -- [{name, designation, phone, email}]
  bank_accounts JSON NULL,             -- [{bank_name, account_name, account_no, ifsc, upi_id}]
  payment_pref_id INT NULL,
  cab_types JSON NULL,
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sup (org_id, name),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE hotels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  group_name VARCHAR(150),
  location VARCHAR(255) NOT NULL,      -- "Gangtok, Sikkim, India"
  city VARCHAR(100) NOT NULL,
  star VARCHAR(20),
  address VARCHAR(500),
  meal_plans JSON NULL,                -- ["CP","MAP"]
  room_types JSON NULL,                -- [{name, aweb, cweb, cnb, rooms, eb}]
  checkin_time VARCHAR(10) DEFAULT '12:00',
  checkout_time VARCHAR(10) DEFAULT '11:00',
  child_age_from INT NOT NULL DEFAULT 6,
  child_age_to INT NOT NULL DEFAULT 12,
  payment_pref_id INT NULL,
  supplier_id INT NULL,                -- book through a supplier instead of direct
  phone VARCHAR(40), email VARCHAR(150), link VARCHAR(255),
  contacts JSON NULL,
  notes TEXT,
  entry_method ENUM('manual','upload') NOT NULL DEFAULT 'manual',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL, updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hotel (org_id, city, name),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE hotel_closures (           -- soldout (blocks sale) and blackout (warns, needs manual rate)
  id INT AUTO_INCREMENT PRIMARY KEY,
  hotel_id INT NOT NULL,
  kind ENUM('soldout','blackout') NOT NULL,
  room_types JSON NULL,                -- NULL = all rooms
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
);

CREATE TABLE transport_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  duty_code VARCHAR(30),
  from_location VARCHAR(150) NOT NULL, from_short VARCHAR(30),
  to_location VARCHAR(150), to_short VARCHAR(30),
  service VARCHAR(150) NOT NULL,       -- Pickup / Sightseeing / Transfer / Drop ...
  code VARCHAR(60),                    -- internal, never shared
  distance_km DECIMAL(8,1) NULL,
  start_time VARCHAR(10), duration_mins INT NULL,
  day_schedule TEXT,
  closing_weekdays VARCHAR(40), closing_dates JSON NULL,
  pickup_points JSON NULL,             -- ["Airport", "Railway Station", "@checkin_hotel"]
  drop_points JSON NULL,
  entry_method ENUM('manual','upload') NOT NULL DEFAULT 'manual',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ts (org_id, from_location),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  city VARCHAR(100),
  description TEXT,
  tourist_types VARCHAR(255) NOT NULL DEFAULT 'Adult, Child (6-12)',  -- ticket age / group configuration
  closing_weekdays VARCHAR(40), closing_dates JSON NULL,
  entry_method ENUM('manual','upload') NOT NULL DEFAULT 'manual',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE activity_services (        -- ticket type / package of an activity
  id INT AUTO_INCREMENT PRIMARY KEY,
  activity_id INT NOT NULL,
  org_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(60),
  description TEXT,
  open_time VARCHAR(10), close_time VARCHAR(10), duration_mins INT NULL,
  slots VARCHAR(255),
  child_age_from INT NOT NULL DEFAULT 6, child_age_to INT NOT NULL DEFAULT 12,
  closing_weekdays VARCHAR(40), closing_dates JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
);

-- One price table for hotels, transport and activities (season-wise)
CREATE TABLE rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  service ENUM('hotel','transport','activity') NOT NULL,
  ref_id INT NOT NULL,                 -- hotels.id / transport_services.id / activity_services.id
  variant VARCHAR(150) NOT NULL DEFAULT '',  -- room type / cab type / Adult|Child
  meal_plan VARCHAR(20) NOT NULL DEFAULT '',
  occupancy INT NULL,                  -- base persons per room (hotel)
  kind ENUM('base','aweb','cweb','cnb') NOT NULL DEFAULT 'base',
  rate_type ENUM('both','sales','ops') NOT NULL DEFAULT 'both',  -- sales = quotation, ops = buying/booking
  season VARCHAR(80),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  weekdays VARCHAR(40),                -- "Sat,Sun" = only these days
  price DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  code VARCHAR(60),
  upload_id INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rate (org_id, service, ref_id, date_from, date_to),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE rate_uploads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  service VARCHAR(20) NOT NULL,
  file_name VARCHAR(200),
  currency CHAR(3) NOT NULL,
  summary JSON NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- =====================================================================
-- Trips, quotes, bookings, payments
-- =====================================================================
CREATE TABLE trip_counters (
  org_id INT PRIMARY KEY,
  last_no INT NOT NULL DEFAULT 1000,
  last_invoice_no INT NOT NULL DEFAULT 0
);

CREATE TABLE trips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  trip_no INT NOT NULL,
  trip_type ENUM('package','individual') NOT NULL DEFAULT 'package',
  services JSON NULL,                  -- services the client asked for
  source_id INT NULL,
  ref_id VARCHAR(60),
  ref_id_normalized VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
    GENERATED ALWAYS AS (NULLIF(UPPER(TRIM(ref_id)), '')) STORED,
  destination_ids JSON NULL,
  start_date DATE NULL,                -- optional for visa / passport only enquiries
  nights INT NULL,
  end_date DATE NULL,
  adults INT NOT NULL DEFAULT 1,
  children_ages JSON NULL,
  infants INT NOT NULL DEFAULT 0,
  foc INT NOT NULL DEFAULT 0,
  guest_salutation VARCHAR(10),
  guest_name VARCHAR(150) NOT NULL,
  guest_phone VARCHAR(40),
  guest_email VARCHAR(150),
  guest_city VARCHAR(100),
  tags JSON NULL,
  notes TEXT,
  stage VARCHAR(20) NOT NULL DEFAULT 'new',
  stage_reason VARCHAR(255),
  sales_user_id INT NULL,
  resv_user_id INT NULL,
  ops_user_id INT NULL,
  latest_quote_id INT NULL,
  converted_quote_id INT NULL,
  converted_at DATETIME NULL,
  package_amount DECIMAL(14,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  arrival_details VARCHAR(255),
  departure_details VARCHAR(255),
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_trip_no (org_id, trip_no),
  UNIQUE KEY uq_trips_org_ref_normalized (org_id, ref_id_normalized),
  INDEX idx_trip_stage (org_id, stage, start_date),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE trip_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  trip_id INT NOT NULL,
  user_id INT NULL,
  message VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_log_trip (trip_id, id),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  trip_id INT NULL,
  body VARCHAR(1000) NOT NULL,
  is_actionable TINYINT(1) NOT NULL DEFAULT 1,
  due_at DATETIME NULL,
  assignee_id INT NULL,
  done_at DATETIME NULL,
  done_by INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task_org (org_id, done_at, due_at),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE quotes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  trip_id INT NOT NULL,
  version INT NOT NULL,
  quote_type ENUM('custom','vendor_package') NOT NULL DEFAULT 'custom',
  start_date DATE NULL,
  nights INT NULL,
  adults INT NOT NULL,
  children_ages JSON NULL,
  infants INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  pricing JSON NOT NULL,
  total_cost DECIMAL(14,2) NOT NULL DEFAULT 0,     -- given (quotation) price before markup
  total_buy DECIMAL(14,2) NOT NULL DEFAULT 0,      -- buying (ops) price
  total_markup DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_tax DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_selling DECIMAL(14,2) NOT NULL DEFAULT 0,
  itinerary JSON NULL,
  remarks_internal TEXT,
  remarks_customer TEXT,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_quote_trip (trip_id, version),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE quote_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quote_id INT NOT NULL,
  org_id INT NOT NULL,
  service VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  details JSON NOT NULL,
  day_no INT NULL,
  cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  buy_cost DECIMAL(14,2) NULL,
  selling_override DECIMAL(14,2) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
);

CREATE TABLE bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  trip_id INT NOT NULL,
  quote_item_id INT NULL,
  service VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  service_date DATE NULL,
  end_date DATE NULL,
  details JSON NOT NULL,
  status VARCHAR(30) NOT NULL,
  supplier_id INT NULL,
  quoted_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  booked_amount DECIMAL(14,2) NULL,
  notes VARCHAR(500),
  locked_at DATETIME NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_booking (org_id, service, status, service_date),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE instalments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  trip_id INT NOT NULL,
  booking_id INT NULL,
  direction ENUM('in','out') NOT NULL,
  party_type ENUM('customer','supplier','hotel') NOT NULL,
  party_id INT NULL,
  party_name VARCHAR(200) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  due_date DATE NOT NULL,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  carried_from_id INT NULL,            -- created/increased by a short payment on this instalment
  comments VARCHAR(255),
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inst (org_id, direction, due_date),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  trip_id INT NULL,
  instalment_id INT NULL,
  account_id INT NULL,                 -- org_bank_accounts.id the money moved through
  direction ENUM('in','out') NOT NULL,
  party_type VARCHAR(20) NOT NULL,
  party_id INT NULL,
  party_name VARCHAR(200) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  paid_at DATETIME NOT NULL,
  mode VARCHAR(30),
  reference VARCHAR(100),
  narration VARCHAR(255),
  allocations JSON NULL,               -- [{instalment_id, amount}] + carry {from_id, to_id, amount, created}
  verified_by INT NULL,
  verified_at DATETIME NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_txn (org_id, paid_at),
  FOREIGN KEY (instalment_id) REFERENCES instalments(id) ON DELETE SET NULL
);

CREATE TABLE notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NULL,
  user_id INT NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500),
  link VARCHAR(255),
  read_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif (user_id, read_at, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================================
-- Platform (Super Admin)
-- =====================================================================
CREATE TABLE admin_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  user_id INT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE platform_invoices (        -- monthly subscription invoices issued to organisations
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  invoice_no VARCHAR(30) NOT NULL,
  period CHAR(7) NOT NULL,              -- YYYY-MM
  plan_name VARCHAR(80),
  currency CHAR(3) NOT NULL,
  org_fee DECIMAL(12,2) NOT NULL, user_fee DECIMAL(12,2) NOT NULL, users INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status ENUM('due','paid','void') NOT NULL DEFAULT 'due',
  paid_at DATETIME NULL, payment_ref VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_inv (org_id, period),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Files kept for records: vendor land package PDFs / pasted emails, booking confirmations, invoices
CREATE TABLE attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL,
  trip_id INT NULL,
  quote_id INT NULL,
  supplier_id INT NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'vendor_package',   -- vendor_package | confirmation | invoice | other
  title VARCHAR(255) NOT NULL,
  file_name VARCHAR(255),
  mime VARCHAR(100),
  size INT NOT NULL DEFAULT 0,
  data LONGBLOB NULL,                  -- the file itself (NULL for pasted email text)
  text MEDIUMTEXT,                     -- extracted / pasted text
  amount DECIMAL(14,2) NULL, currency CHAR(3) NULL,   -- vendor price, handy for reconciliation / Tally
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_att (org_id, trip_id), INDEX idx_att_sup (org_id, supplier_id),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
