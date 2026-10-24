/** Synthetic device planning rates; no runtime fixture reads or simulation RNG. */
export const DEVICE_CATALOG = Object.freeze([
  Object.freeze({ deviceId: 'CX4820', ratedUnitsPerHour: 4820 }),
  Object.freeze({ deviceId: 'PM0096', ratedUnitsPerHour: 96 }),
  Object.freeze({ deviceId: 'GH0310', ratedUnitsPerHour: 310 }),
  Object.freeze({ deviceId: 'SC2150', ratedUnitsPerHour: 2150 }),
  Object.freeze({ deviceId: 'BR0038', ratedUnitsPerHour: 38 }),
  Object.freeze({ deviceId: 'VS0745', ratedUnitsPerHour: 745 }),
  Object.freeze({ deviceId: 'SR1260', ratedUnitsPerHour: 1260 }),
  Object.freeze({ deviceId: 'TB0540', ratedUnitsPerHour: 540 }),
  Object.freeze({ deviceId: 'DS0064', ratedUnitsPerHour: 64 }),
  Object.freeze({ deviceId: 'LS3600', ratedUnitsPerHour: 3600 }),
  Object.freeze({ deviceId: 'HP1880', ratedUnitsPerHour: 1880 }),
  Object.freeze({ deviceId: 'PI0212', ratedUnitsPerHour: 212 }),
  Object.freeze({ deviceId: 'SG2940', ratedUnitsPerHour: 2940 }),
  Object.freeze({ deviceId: 'FL0087', ratedUnitsPerHour: 87 }),
  Object.freeze({ deviceId: 'CS1015', ratedUnitsPerHour: 1015 }),
  Object.freeze({ deviceId: 'MB0475', ratedUnitsPerHour: 475 }),
  Object.freeze({ deviceId: 'CF0158', ratedUnitsPerHour: 158 }),
  Object.freeze({ deviceId: 'CW6300', ratedUnitsPerHour: 6300 }),
  Object.freeze({ deviceId: 'BC0029', ratedUnitsPerHour: 29 }),
  Object.freeze({ deviceId: 'CP0890', ratedUnitsPerHour: 890 }),
]);

export function deviceById(deviceId) { return DEVICE_CATALOG.find(row => row.deviceId === deviceId); }

export function deviceForStation(stationId) {
  const hash = [...stationId].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16_777_619) >>> 0, 2_166_136_261);
  return DEVICE_CATALOG[hash % DEVICE_CATALOG.length];
}
