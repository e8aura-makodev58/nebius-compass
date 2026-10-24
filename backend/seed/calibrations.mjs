/** Synthetic calibration facts shared by both runtime seeds and room instances. */
export function createSeedCalibrations() {
  return ['ATE-1', 'ATE-2'].map((cellId, index) => ({ calibrationId: `CAL-SEED-${index + 1}`, cellId,
    instrumentId: `PS-${index + 1}`, calibratedAt: '2026-08-01T08:00:00.000Z', dueAt: '2027-08-01T08:00:00.000Z' }));
}
