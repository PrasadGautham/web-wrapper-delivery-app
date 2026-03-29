import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export interface OperationalSnapshotInput {
  queuedOrders: number;
  pendingOffers: number;
  stuckQueuedOrders: number;
  onlineDrivers: number;
  driverFreshness: {
    fresh: number;
    stale: number;
    missing: number;
  };
}

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
  readonly pushOffersSentTotal: Counter<string>;
  readonly pushOfferFailuresTotal: Counter<string>;
  readonly dispatchAssignmentsTotal: Counter<string>;
  readonly dispatchOfferExpirationsTotal: Counter<string>;
  readonly queuedOrdersGauge: Gauge<string>;
  readonly pendingOffersGauge: Gauge<string>;
  readonly stuckQueuedOrdersGauge: Gauge<string>;
  readonly onlineDriversGauge: Gauge<string>;
  readonly driverLocationFreshnessGauge: Gauge<string>;

  private readonly authFailureCounts = new Map<string, number>();
  private pushOffersSentCount = 0;
  private pushOfferFailuresCount = 0;
  private dispatchAssignmentsCount = 0;
  private dispatchOfferExpirationsCount = 0;

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
    this.pushOffersSentTotal = new Counter({
      name: 'driver_app_push_offers_sent_total',
      help: 'Incoming order push offers successfully sent',
      registers: [this.registry],
    });
    this.pushOfferFailuresTotal = new Counter({
      name: 'driver_app_push_offer_failures_total',
      help: 'Incoming order push offer failures',
      labelNames: ['reason'],
      registers: [this.registry],
    });
    this.dispatchAssignmentsTotal = new Counter({
      name: 'driver_app_dispatch_assignments_total',
      help: 'Dispatch assignments created',
      labelNames: ['tier'],
      registers: [this.registry],
    });
    this.dispatchOfferExpirationsTotal = new Counter({
      name: 'driver_app_dispatch_offer_expirations_total',
      help: 'Dispatch offers that expired before acceptance',
      registers: [this.registry],
    });
    this.queuedOrdersGauge = new Gauge({
      name: 'driver_app_queued_orders',
      help: 'Orders currently waiting in the queue',
      registers: [this.registry],
    });
    this.pendingOffersGauge = new Gauge({
      name: 'driver_app_pending_offers',
      help: 'Orders currently assigned and pending acceptance',
      registers: [this.registry],
    });
    this.stuckQueuedOrdersGauge = new Gauge({
      name: 'driver_app_stuck_queued_orders',
      help: 'Queued orders older than the configured stuck-order threshold',
      registers: [this.registry],
    });
    this.onlineDriversGauge = new Gauge({
      name: 'driver_app_online_drivers',
      help: 'Drivers currently online',
      registers: [this.registry],
    });
    this.driverLocationFreshnessGauge = new Gauge({
      name: 'driver_app_driver_location_freshness',
      help: 'Driver location freshness counts by state',
      labelNames: ['state'],
      registers: [this.registry],
    });
  }

  recordAuthFailure(route: string): void {
    this.authFailuresTotal.inc({ route });
    this.authFailureCounts.set(route, (this.authFailureCounts.get(route) ?? 0) + 1);
  }

  recordPushOfferSent(): void {
    this.pushOffersSentTotal.inc();
    this.pushOffersSentCount += 1;
  }

  recordPushOfferFailure(reason: 'disabled' | 'missing_token' | 'send_failed'): void {
    this.pushOfferFailuresTotal.inc({ reason });
    this.pushOfferFailuresCount += 1;
  }

  recordDispatchAssignment(tier: string): void {
    this.dispatchAssignmentsTotal.inc({ tier });
    this.dispatchAssignmentsCount += 1;
  }

  recordOfferExpiration(): void {
    this.dispatchOfferExpirationsTotal.inc();
    this.dispatchOfferExpirationsCount += 1;
  }

  updateOperationalSnapshot(snapshot: OperationalSnapshotInput): void {
    this.queuedOrdersGauge.set(snapshot.queuedOrders);
    this.pendingOffersGauge.set(snapshot.pendingOffers);
    this.stuckQueuedOrdersGauge.set(snapshot.stuckQueuedOrders);
    this.onlineDriversGauge.set(snapshot.onlineDrivers);
    this.driverLocationFreshnessGauge.set({ state: 'fresh' }, snapshot.driverFreshness.fresh);
    this.driverLocationFreshnessGauge.set({ state: 'stale' }, snapshot.driverFreshness.stale);
    this.driverLocationFreshnessGauge.set({ state: 'missing' }, snapshot.driverFreshness.missing);
  }

  getCountersSnapshot(): {
    authFailures: Array<{ route: string; count: number }>;
    recentAuthFailures: number;
    pushOffersSent: number;
    pushOfferFailures: number;
    dispatchAssignments: number;
    offerExpirations: number;
  } {
    const authFailures = Array.from(this.authFailureCounts.entries())
      .map(([route, count]) => ({ route, count }))
      .sort((left, right) => right.count - left.count);
    return {
      authFailures,
      recentAuthFailures: authFailures.reduce((sum, item) => sum + item.count, 0),
      pushOffersSent: this.pushOffersSentCount,
      pushOfferFailures: this.pushOfferFailuresCount,
      dispatchAssignments: this.dispatchAssignmentsCount,
      offerExpirations: this.dispatchOfferExpirationsCount,
    };
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
