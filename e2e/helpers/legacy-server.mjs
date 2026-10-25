/** Explicit component harness for pre-login UI regressions. Never a deploy entry point. */
import { join } from 'node:path';
import { createCompassServer } from '../../backend/src/server.mjs';
import { createControlRoomManager } from '../../backend/src/control-room-manager.mjs';
import { createProviderSettingsService } from '../../backend/src/provider-settings.mjs';
import { createApplicationLogger, createApplicationLogStore } from '../../backend/src/application-log-store.mjs';
if (process.env.NODE_ENV !== 'test' || process.env.COMPASS_HOST !== '127.0.0.1' || !process.env.COMPASS_CONTROL_ROOMS_DATA_ROOT) throw new Error('Isolated E2E environment required');
const root = process.env.COMPASS_CONTROL_ROOMS_DATA_ROOT;
const logger = createApplicationLogger(createApplicationLogStore(join(root, 'application-events.json')), console);
const settings = createProviderSettingsService({ filePath: join(root, 'provider-settings.json'), logger, checkModelsOnBoot: false });
await settings.initialize();
const manager = await createControlRoomManager({ dataRoot: root, logger, workplacesEnabled: false,
  plannerOptions: () => settings.requestOptions('event-planner'), agentOptions: () => settings.requestOptions('compass'),
  investigatorOptions: () => settings.requestOptions('investigator'), narratorOptions: () => settings.requestOptions('narrator'), assistantOptions: () => settings.requestOptions('assistant') });
const server = createCompassServer(manager, logger, settings, { sessionService: null });
server.on('error', () => { manager.stopProcessScheduler(); process.exitCode = 1; });
server.listen(Number(process.env.COMPASS_PORT), '127.0.0.1', () => manager.startProcessScheduler());
