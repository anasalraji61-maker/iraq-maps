// Activity module — check-in gamification service and migrations.
export const activityMigrationsDir = new URL('../migrations', import.meta.url).pathname;

export { CheckInsService } from './checkins.service';
export type { CheckInDb, EventPublisher, PlacesLookup } from './checkins.service';
