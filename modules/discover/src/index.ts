import { fileURLToPath } from 'node:url';

export { discoverModule } from './discover.module';
export { SocialService } from './social.service';
export { EventsService } from './events.service';
export type { EventRecord, EventWithRsvp, IraqiHoliday, CreateEventInput, UpdateEventInput, RsvpStatusEnum } from './events.service';

/** Absolute path to this module's migrations (schema `discover`). @public */
export const discoverMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
