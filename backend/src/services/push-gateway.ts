import { readFileSync } from 'node:fs';

import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { DriverRecord, OrderRecord } from '../domain/models.js';

export class PushGateway {
  private readonly enabled: boolean;
  private readonly warnedDisabled: boolean = false;

  constructor(private readonly logger: { info: (message: unknown) => void; warn: (message: unknown) => void }) {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!serviceAccountPath) {
      this.enabled = false;
      this.logger.warn(
        'PushGateway disabled. Set FIREBASE_SERVICE_ACCOUNT_PATH to enable backend-driven FCM dispatch.',
      );
      return;
    }

    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    if (getApps().length === 0) {
      initializeApp({ credential: cert(serviceAccount) });
    } else {
      getApp();
    }
    this.enabled = true;
    this.logger.info('PushGateway initialized with Firebase Admin credentials.');
  }

  async sendIncomingOrderOffer(driver: DriverRecord, order: OrderRecord): Promise<boolean> {
    if (!this.enabled || !driver.deviceToken) {
      return false;
    }

    const restaurantName = order.restaurant?.name ?? 'New delivery offer';
    const estimatedKm =
      typeof order.driverDisplayDistanceKm === 'number' && Number.isFinite(order.driverDisplayDistanceKm)
        ? order.driverDisplayDistanceKm
        : typeof order.estimatedKm === 'number' && Number.isFinite(order.estimatedKm)
          ? order.estimatedKm
          : 0;
    const tripEarnings =
      typeof order.tripEarnings === 'number' && Number.isFinite(order.tripEarnings)
        ? order.tripEarnings
        : 0;

    await getMessaging().send({
      token: driver.deviceToken,
      notification: {
        title: restaurantName,
        body: `${order.deliveryArea} | ${estimatedKm.toFixed(1)} km | AED ${tripEarnings.toFixed(2)}`,
      },
      data: {
        type: 'incoming_order_offer',
        route: '/incoming-order',
        orderId: order.id,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'incoming_orders_v2_silent',
          sound: undefined,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: undefined,
            contentAvailable: true,
          },
        },
      },
    });

    return true;
  }
}
