const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * DOCDO schedules notifications on the device and does not receive remote pushes.
 * Expo's default notifications plugin adds the APNs entitlement automatically,
 * so remove it to keep personal-team development builds signable.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (entitlementsConfig) => {
    delete entitlementsConfig.modResults['aps-environment'];
    return entitlementsConfig;
  });
};
