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

setInterval(() => {
  backendService.runDispatchCycle().catch((error) => {
    observability.dispatchCycleFailuresTotal.inc();
    app.log.error(error);
    void alerting.sendAlert('dispatch.cycle.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}, config.dispatchIntervalMs);

app.listen({ port: config.port, host: config.host }).catch((error) => {
  app.log.error(error);
  void alerting.sendAlert('server.start.failed', {
    message: error instanceof Error ? error.message : String(error),
  }).finally(() => process.exit(1));
});
