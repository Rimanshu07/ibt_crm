-- v3.1: quotes saved with v3 stored an empty "fixed selling price" as 0 for land package / extra-service lines,
-- so those lines showed Selling ₹0. This clears the wrong value; then open each affected quote with
-- "Edit quote" and Save once so its totals are recalculated.
UPDATE quote_items SET selling_override = NULL
 WHERE selling_override = 0 AND service IN ('land_package', 'other', 'hotel', 'transport', 'activity');

-- Quotes that need a re-save (shows trip and version):
SELECT t.trip_no, q.version, q.total_selling FROM quotes q JOIN trips t ON t.id = q.trip_id
 WHERE q.id IN (SELECT DISTINCT quote_id FROM quote_items WHERE service IN ('land_package', 'other')) ORDER BY t.trip_no, q.version;
