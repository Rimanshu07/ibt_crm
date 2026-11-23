'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if ref_id_normalized generated column exists
    const [columns] = await queryInterface.sequelize.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trips' AND COLUMN_NAME = 'ref_id_normalized'"
    );
    if (!columns || !columns.length) {
      await queryInterface.sequelize.query(
        "ALTER TABLE `trips` ADD COLUMN `ref_id_normalized` VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin GENERATED ALWAYS AS (NULLIF(UPPER(TRIM(`ref_id`)), '')) STORED"
      );
    }

    // Add composite UNIQUE index on (org_id, ref_id_normalized)
    const [indexes] = await queryInterface.sequelize.query(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trips' AND INDEX_NAME = 'uq_trips_org_ref_normalized'"
    );
    if (!indexes || !indexes.length) {
      await queryInterface.sequelize.query(
        "ALTER TABLE `trips` ADD UNIQUE INDEX `uq_trips_org_ref_normalized` (`org_id`, `ref_id_normalized`)"
      );
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "ALTER TABLE `trips` DROP INDEX `uq_trips_org_ref_normalized`"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE `trips` DROP COLUMN `ref_id_normalized`"
    );
  }
};
