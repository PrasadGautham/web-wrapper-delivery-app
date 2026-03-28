import { EtaProvider, EtaRequest } from './eta-provider.js';

export class GoogleRoutesEtaProvider implements EtaProvider {
  constructor(private readonly apiKey: string) {}

  async estimateMinutes(request: EtaRequest): Promise<{ minutes: number; source: 'google-routes' } | null> {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'routes.duration',
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: request.origin.latitude,
              longitude: request.origin.longitude,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: request.destination.latitude,
              longitude: request.destination.longitude,
            },
          },
        },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as { routes?: Array<{ duration?: string }> };
    const duration = body.routes?.[0]?.duration;
    if (!duration) {
      return null;
    }
    const seconds = Number(duration.replace('s', ''));
    if (Number.isNaN(seconds)) {
      return null;
    }
    return { minutes: Math.max(1, Math.round(seconds / 60)), source: 'google-routes' };
  }
}
