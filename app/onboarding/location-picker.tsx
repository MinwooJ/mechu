"use client";

import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useMemo } from "react";

import { useT } from "@/lib/i18n/client";

type Position = { lat: number; lng: number };

type Props = {
  value: Position;
  onChange: (next: Position) => void;
};

function markerIcon(): L.DivIcon {
  return L.divIcon({
    className: "picker-marker",
    html: "<span></span>",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function Recenter({ position }: { position: Position }) {
  const map = useMap();
  map.setView([position.lat, position.lng], map.getZoom(), { animate: true });
  return null;
}

function PickerEvents({ onPick }: { onPick: (pos: Position) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function LocationPicker({ value, onChange }: Props) {
  const icon = useMemo(() => markerIcon(), []);
  const t = useT();

  return (
    <div className="manual-map-wrap">
      <MapContainer className="manual-picker-map" center={[value.lat, value.lng]} zoom={15} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter position={value} />
        <PickerEvents onPick={onChange} />
        <Marker
          position={[value.lat, value.lng]}
          draggable
          icon={icon}
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onChange({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      </MapContainer>
      <p className="manual-map-label">{t("locationPicker.hint")}</p>
    </div>
  );
}
