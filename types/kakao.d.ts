export {};

declare global {
  interface Window {
    kakao: {
      maps: {
        load(cb: () => void): void;
        LatLng: new (lat: number, lng: number) => unknown;
        Size: new (width: number, height: number) => unknown;
        Point: new (x: number, y: number) => unknown;
        Map: new (container: HTMLElement, options: { center: unknown; level: number }) => {
          setBounds(bounds: unknown): void;
        };
        MarkerImage: new (src: string, size: unknown, options?: { offset?: unknown }) => unknown;
        Marker: new (options: {
          map: unknown;
          position: unknown;
          title?: string;
          image?: unknown;
          clickable?: boolean;
        }) => {
          setMap(map: unknown | null): void;
        };
        InfoWindow: new (options: { content: string }) => {
          open(map: unknown, marker: unknown): void;
          close(): void;
        };
        LatLngBounds: new () => {
          extend(latlng: unknown): void;
        };
        event: {
          addListener(target: unknown, type: string, handler: () => void): void;
          removeListener(target: unknown, type: string, handler: () => void): void;
        };
      };
    };
  }
}
