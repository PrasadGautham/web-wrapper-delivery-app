import { haversineDistanceKm } from '../utils/geo.js';
import { EtaProvider, EtaRequest } from './eta-provider.js';

const averageKmPerMinute = 0.55;

export class HeuristicEtaProvider implements EtaProvider {
  async estimateMinutes(request: EtaRequest): Promise<{ minutes: number; source: 'live-driver-location' | 'static-estimate' }> {
    const minutes = Math.max(3, Math.round(haversineDistanceKm(request.origin, request.destination) / averageKmPerMinute));
    return { minutes, source: 'static-estimate' };
  }
}
