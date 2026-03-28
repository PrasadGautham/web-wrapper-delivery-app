import { runPortalAuthRoutesTests } from './portal-auth-routes.test.js';
import { runBackendServiceTests } from './backend-service.test.js';
import { runConfigTests } from './config.test.js';
import { runDispatchServiceTests } from './dispatch-service.test.js';
import { runOpsSurfaceTests } from './ops-surface.test.js';
import { runPostgresIntegrationTests } from './postgres-integration.test.js';
import { runStoreContextsTests } from './store-contexts.test.js';

const suites = [
  ['config', runConfigTests],
  ['store-contexts', runStoreContextsTests],
  ['backend-service', runBackendServiceTests],
  ['dispatch-service', runDispatchServiceTests],
  ['ops-surface', runOpsSurfaceTests],
  ['portal-auth-routes', runPortalAuthRoutesTests],
  ['postgres-integration', runPostgresIntegrationTests],
] as const;

let failures = 0;
for (const [name, suite] of suites) {
  try {
    await suite();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exit(1);
}


