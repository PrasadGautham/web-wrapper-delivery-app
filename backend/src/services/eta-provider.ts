export interface EtaRequest {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
}

export interface EtaProvider {
  estimateMinutes(request: EtaRequest): Promise<{ minutes: number; source: 'google-routes' | 'live-driver-location' | 'static-estimate' } | null>;
}
