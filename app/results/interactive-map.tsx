"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

import type { Locale } from "@/lib/i18n/config";
import { formatDistance } from "@/lib/i18n/format";
import { t as translate } from "@/lib/i18n/messages";
import type { RecommendationItem } from "@/lib/reco/types";

type Position = { lat: number; lng: number };

type Props = {
  origin: Position;
  items: RecommendationItem[];
  selectedPlaceId: string | null;
  mapFocusTarget: "selected" | "origin";
  focusNonce: number;
  mobileBottomOffset?: number;
  locale: Locale;
  onSelect: (placeId: string) => void;
};

function FitBounds({
  origin,
  items,
  mapFocusTarget,
}: {
  origin: Position;
  items: RecommendationItem[];
  mapFocusTarget: "selected" | "origin";
}) {
  const map = useMap();
  const didFitRef = useRef(false);

  useEffect(() => {
    if (mapFocusTarget === "origin") return;
    const points: L.LatLngExpression[] = [[origin.lat, origin.lng], ...items.map((i) => [i.lat, i.lng] as L.LatLngExpression)];
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds.pad(0.25), { animate: didFitRef.current });
    didFitRef.current = true;
  }, [map, origin, items, mapFocusTarget]);

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

function FocusTarget({
  origin,
  items,
  selectedPlaceId,
  mapFocusTarget,
  focusNonce,
  mobileBottomOffset = 0,
}: {
  origin: Position;
  items: RecommendationItem[];
  selectedPlaceId: string | null;
  mapFocusTarget: "selected" | "origin";
  focusNonce: number;
  mobileBottomOffset?: number;
}) {
  const map = useMap();

  useEffect(() => {
    const targetLatLng: [number, number] | null =
      mapFocusTarget === "origin"
        ? [origin.lat, origin.lng]
        : (() => {
            if (!selectedPlaceId) return null;
            const selected = items.find((item) => item.place_id === selectedPlaceId);
            if (!selected) return null;
            return [selected.lat, selected.lng];
          })();

    if (!targetLatLng) return;

    const nextZoom = Math.max(map.getZoom(), 15);
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 980px)").matches;
    if (!isMobile) {
      map.flyTo(targetLatLng, nextZoom, { animate: true, duration: 0.35 });
      return;
    }

    const upwardOffset = Math.round(mobileBottomOffset / 2);
    const markerPoint = map.latLngToContainerPoint(targetLatLng);
    const adjustedCenter = map.containerPointToLatLng(L.point(markerPoint.x, markerPoint.y + upwardOffset));
    map.flyTo(adjustedCenter, nextZoom, { animate: true, duration: 0.35 });
  }, [map, origin, items, selectedPlaceId, mapFocusTarget, focusNonce, mobileBottomOffset]);

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

const RANK_CLASSES = ["gold", "silver", "bronze"] as const;

function itemIcon(rank: number, active: boolean): L.DivIcon {
  const rankClass = RANK_CLASSES[rank - 1] ?? "";
  return L.divIcon({
    className: `map-marker item ${rankClass}${active ? " active" : ""}`,
    html: `<span>${rank}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function InteractiveMap({
  origin,
  items,
  selectedPlaceId,
  mapFocusTarget,
  focusNonce,
  mobileBottomOffset,
  locale,
  onSelect,
}: Props) {
  const baseCenter = useMemo<L.LatLngExpression>(() => [origin.lat, origin.lng], [origin]);

  return (
    <MapContainer className="result-leaflet-map" center={baseCenter} zoom={14} scrollWheelZoom zoomControl dragging touchZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBounds origin={origin} items={items} mapFocusTarget={mapFocusTarget} />
      <EnsureInteractive stamp={`${origin.lat},${origin.lng}:${items.length}`} />
      <FocusTarget
        origin={origin}
        items={items}
        selectedPlaceId={selectedPlaceId}
        mapFocusTarget={mapFocusTarget}
        focusNonce={focusNonce}
        mobileBottomOffset={mobileBottomOffset}
      />

      <Marker position={[origin.lat, origin.lng]} icon={originIcon()}>
        <Popup>{translate(locale, "results.mapFocusOriginAria")}</Popup>
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
            {formatDistance(item.distance_m, locale)}{item.rating != null && <> · ★{item.rating}</>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
