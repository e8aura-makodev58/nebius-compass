/** Independent synthetic inventory rows used only when migrating unconfigured rooms. */
export function createSeedLoadboards() {
  return [
    { boardId: 'LB-0412', revision: 'C', condition: 'SERVICEABLE', cellId: null, approvedPrograms: ['SR1260-P3'] },
    { boardId: 'LB-0398', revision: 'B', condition: 'SERVICEABLE', cellId: null, approvedPrograms: ['PM0096-P2'] },
    { boardId: 'LB-0204', revision: 'A', condition: 'UNDER_REPAIR', cellId: null, approvedPrograms: ['SR1260-P3'] },
  ];
}
