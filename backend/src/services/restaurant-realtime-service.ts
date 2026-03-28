import { randomUUID } from 'node:crypto';

interface RestaurantStreamEvent {
  type: string;
  restaurantId: string;
  at: string;
}

type Listener = (event: RestaurantStreamEvent) => void;

export class RestaurantRealtimeService {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly tickets = new Map<string, { restaurantIds: string[]; expiresAt: number }>();

  issueTicket(restaurantIds: string | string[]): { ticket: string; expiresAt: string } {
    const ticket = randomUUID();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const normalized = Array.isArray(restaurantIds) ? [...new Set(restaurantIds)] : [restaurantIds];
    this.tickets.set(ticket, { restaurantIds: normalized, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  resolveTicket(ticket: string): { restaurantIds: string[] } | null {
    this.cleanupExpiredTickets();
    const record = this.tickets.get(ticket);
    return record ? { restaurantIds: [...record.restaurantIds] } : null;
  }

  subscribe(restaurantId: string, listener: Listener): () => void {
    const bucket = this.listeners.get(restaurantId) ?? new Set<Listener>();
    bucket.add(listener);
    this.listeners.set(restaurantId, bucket);
    return () => {
      const current = this.listeners.get(restaurantId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(restaurantId);
      }
    };
  }

  subscribeMany(restaurantIds: string[], listener: Listener): () => void {
    const unsubscribers = restaurantIds.map((restaurantId) => this.subscribe(restaurantId, listener));
    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }

  publishRestaurantUpdated(restaurantId: string): void {
    const listeners = this.listeners.get(restaurantId);
    if (!listeners || listeners.size === 0) {
      return;
    }
    const event: RestaurantStreamEvent = {
      type: 'restaurant-updated',
      restaurantId,
      at: new Date().toISOString(),
    };
    for (const listener of listeners) {
      listener(event);
    }
  }

  private cleanupExpiredTickets(): void {
    const now = Date.now();
    for (const [ticket, record] of this.tickets.entries()) {
      if (record.expiresAt <= now) {
        this.tickets.delete(ticket);
      }
    }
  }
}
