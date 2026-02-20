"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

import type { RecommendationItem } from "@/lib/reco/types";

type Position = { lat: number; lng: number };

type Props = {
  origin: Position;
  items: RecommendationItem[];
  selectedPlaceId: string | null;
  focusNonce: number;
  onSelect: (placeId: string) => void;
};

function FitBounds({ origin, items }: { origin: Position; items: RecommendationItem[] }) {
  const map = useMap();
  const didFitRef = useRef(false);

  useEffect(() => {
    const points: L.LatLngExpression[] = [[origin.lat, origin.lng], ...items.map((i) => [i.lat, i.lng] as L.LatLngExpression)];
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.25), { animate: didFitRef.current });
    didFitRef.current = true;
  }, [map, origin, items]);

  return null;
}

function EnsureInteractive({ stamp }: { stamp: string }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
      map.dragging?.enable();
      map.touchZoom?.enable();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [map, stamp]);

  return null;
}

function FocusSelected({
  items,
  selectedPlaceId,
  focusNonce,
}: {
  items: RecommendationItem[];
  selectedPlaceId: string | null;
  focusNonce: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!selectedPlaceId) return;
    const selected = items.find((item) => item.place_id === selectedPlaceId);
    if (!selected) return;

    const nextZoom = Math.max(map.getZoom(), 15);
    map.flyTo([selected.lat, selected.lng], nextZoom, { animate: true, duration: 0.35 });
  }, [map, items, selectedPlaceId, focusNonce]);

  return null;
}

function originIcon(): L.DivIcon {
  return L.divIcon({
    className: "map-marker origin",
    html: "<span>M</span>",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function itemIcon(rank: number, active: boolean): L.DivIcon {
  return L.divIcon({
    className: `map-marker item${active ? " active" : ""}`,
    html: `<span>${rank}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function InteractiveMap({ origin, items, selectedPlaceId, focusNonce, onSelect }: Props) {
  const baseCenter = useMemo<L.LatLngExpression>(() => [origin.lat, origin.lng], [origin]);

  return (
    <MapContainer className="result-leaflet-map" center={baseCenter} zoom={14} scrollWheelZoom zoomControl dragging touchZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBounds origin={origin} items={items} />
      <EnsureInteractive stamp={`${origin.lat},${origin.lng}:${items.length}`} />
      <FocusSelected items={items} selectedPlaceId={selectedPlaceId} focusNonce={focusNonce} />

      <Marker position={[origin.lat, origin.lng]} icon={originIcon()}>
        <Popup>검색 기준 위치</Popup>
      </Marker>

      {items.map((item, idx) => (
        <Marker
          key={item.place_id}
          position={[item.lat, item.lng]}
          icon={itemIcon(idx + 1, item.place_id === selectedPlaceId)}
          eventHandlers={{
            click: () => onSelect(item.place_id),
          }}
        >
          <Popup>
            <strong>{item.name}</strong>
            <br />
            {item.distance_m}m · ★{item.rating}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
