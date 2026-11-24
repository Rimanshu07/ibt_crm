-- v3.3: Allow base64 data URLs and long URLs for organization branding images (logo, header, footer)
ALTER TABLE organizations MODIFY COLUMN logo_url MEDIUMTEXT;
ALTER TABLE organizations MODIFY COLUMN header_image MEDIUMTEXT;
ALTER TABLE organizations MODIFY COLUMN footer_image MEDIUMTEXT;
