import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export class ObservabilityService {
  readonly registry = new Registry();
  readonly requestsTotal: Counter<string>;
  readonly requestDurationMs: Histogram<string>;
  readonly activeRequests: Gauge<string>;
  readonly rateLimitRejectionsTotal: Counter<string>;
  readonly dispatchCycleFailuresTotal: Counter<string>;
  readonly uncaughtErrorsTotal: Counter<string>;
  readonly authFailuresTotal: Counter<string>;
  readonly cspViolationReportsTotal: Counter<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'driver_app_' });

    this.requestsTotal = new Counter({
      name: 'driver_app_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.requestDurationMs = new Histogram({
      name: 'driver_app_http_request_duration_ms',
      help: 'HTTP request duration in milliseconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });
    this.activeRequests = new Gauge({
      name: 'driver_app_http_active_requests',
      help: 'Active HTTP requests currently being processed',
      registers: [this.registry],
    });
    this.rateLimitRejectionsTotal = new Counter({
      name: 'driver_app_rate_limit_rejections_total',
      help: 'Requests rejected by rate limiting',
      labelNames: ['bucket'],
      registers: [this.registry],
    });
    this.dispatchCycleFailuresTotal = new Counter({
      name: 'driver_app_dispatch_cycle_failures_total',
      help: 'Dispatch cycle failures',
      registers: [this.registry],
    });
    this.uncaughtErrorsTotal = new Counter({
      name: 'driver_app_uncaught_errors_total',
      help: 'Unhandled request errors',
      registers: [this.registry],
    });
    this.authFailuresTotal = new Counter({
      name: 'driver_app_auth_failures_total',
      help: 'Authentication failures by route',
      labelNames: ['route'],
      registers: [this.registry],
    });
    this.cspViolationReportsTotal = new Counter({
      name: 'driver_app_csp_violation_reports_total',
      help: 'CSP violation reports received by the backend',
      labelNames: ['effective_directive'],
      registers: [this.registry],
    });
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }
}

