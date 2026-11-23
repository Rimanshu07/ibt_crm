-- Upgrade an existing v2 database to v3 (structured quote form + vendor land packages).
-- Fresh installs: just run schema.sql (already includes all of this).
ALTER TABLE transport_services
  ADD COLUMN pickup_points JSON NULL AFTER closing_dates,
  ADD COLUMN drop_points JSON NULL AFTER pickup_points;

ALTER TABLE activities
  ADD COLUMN tourist_types VARCHAR(255) NOT NULL DEFAULT 'Adult, Child (6-12)' AFTER description,
  ADD COLUMN closing_weekdays VARCHAR(40) NULL AFTER tourist_types,
  ADD COLUMN closing_dates JSON NULL AFTER closing_weekdays;

CREATE TABLE IF NOT EXISTS attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  org_id INT NOT NULL, trip_id INT NULL, quote_id INT NULL, supplier_id INT NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'vendor_package',
  title VARCHAR(255) NOT NULL, file_name VARCHAR(255), mime VARCHAR(100), size INT NOT NULL DEFAULT 0,
  data LONGBLOB NULL, text MEDIUMTEXT, amount DECIMAL(14,2) NULL, currency CHAR(3) NULL,
  created_by INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_att (org_id, trip_id), INDEX idx_att_sup (org_id, supplier_id),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
-- Vendor PDFs are sent as JSON (base64); allow ~20 MB request packets.
-- SET GLOBAL max_allowed_packet = 33554432;
