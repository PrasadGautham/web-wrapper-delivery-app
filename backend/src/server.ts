import { AlertingService } from './services/alerting-service.js';
import { buildApp } from './app.js';
import { loadAppConfig } from './config/app-config.js';

const config = loadAppConfig();
const { app, backendService, observability } = await buildApp(config);
const alerting = new AlertingService(
  config.alertWebhookUrl,
  config.alertMinIntervalSeconds * 1000,
  app.log,
);
let lastPushOfferFailureCount = 0;
let lastStuckOrderSignature = '';

setInterval(() => {
  backendService.runDispatchCycle().catch((error) => {
    observability.dispatchCycleFailuresTotal.inc();
    app.log.error(error);
    void alerting.sendAlert('dispatch.cycle.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, config.dispatchIntervalMs);

setInterval(() => {
  backendService.getAdminOperationalHealth({ tenantId: null, role: 'platformAdmin' }).then((health: Awaited<ReturnType<typeof backendService.getAdminOperationalHealth>>) => {
    const hasNewPushFailures = health.summary.pushOfferFailures > lastPushOfferFailureCount;
    const stuckOrderSignature = `${health.summary.stuckQueuedOrders}:${health.summary.oldestQueuedOrderMinutes}`;
    const hasNewStuckOrders = health.summary.stuckQueuedOrders > 0 && stuckOrderSignature !== lastStuckOrderSignature;

    lastPushOfferFailureCount = health.summary.pushOfferFailures;
    lastStuckOrderSignature = health.summary.stuckQueuedOrders > 0 ? stuckOrderSignature : '';

    if (!hasNewPushFailures && !hasNewStuckOrders) {
      return;
    }
    void alerting.sendAlert('ops.health.degraded', {
      stuckQueuedOrders: health.summary.stuckQueuedOrders,
      pushOfferFailures: health.summary.pushOfferFailures,
      oldestQueuedOrderMinutes: health.summary.oldestQueuedOrderMinutes,
      onlineDrivers: health.summary.onlineDrivers,
      staleDrivers: health.summary.driversWithStaleLocation,
      missingDriverLocations: health.summary.driversWithMissingLocation,
    });
  }).catch((error: unknown) => {
    app.log.error(error);
    void alerting.sendAlert('ops.health.check.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, config.opsHealthAlertIntervalSeconds * 1000);

app.listen({ port: config.port, host: config.host }).catch((error) => {
  app.log.error(error);
  void alerting.sendAlert('server.start.failed', {
    message: error instanceof Error ? error.message : String(error),
  }).finally(() => process.exit(1));
});
