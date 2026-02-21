"use client";

import { useEffect, useRef, useState } from "react";

import type { RecommendationItem } from "@/lib/reco/types";

type Position = { lat: number; lng: number };

type Props = {
  origin: Position;
  items: RecommendationItem[];
  selectedPlaceId: string | null;
  mapFocusTarget: "selected" | "origin";
  focusNonce: number;
  onSelect: (placeId: string) => void;
  onLoadFail?: () => void;
};

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY ?? "";

function pinSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="12" fill="${color}" stroke="#fff" stroke-width="3"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function loadKakaoSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.kakao?.maps) {
    return new Promise((resolve) => window.kakao.maps.load(resolve));
  }

  return new Promise((resolve, reject) => {
    const existed = document.getElementById("kakao-map-sdk") as HTMLScriptElement | null;
    if (existed) {
      existed.addEventListener("load", () => window.kakao.maps.load(resolve), { once: true });
      existed.addEventListener("error", () => reject(new Error("failed_to_load_kakao_sdk")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "kakao-map-sdk";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=${KAKAO_KEY}`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(resolve);
    script.onerror = () => reject(new Error("failed_to_load_kakao_sdk"));
    document.head.appendChild(script);
  });
}

export default function KakaoMap({ origin, items, selectedPlaceId, mapFocusTarget, focusNonce, onSelect, onLoadFail }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanups: Array<() => void> = [];
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    if (!containerRef.current || !KAKAO_KEY) {
      setFailed(true);
      onLoadFail?.();
      return;
    }

    loadKakaoSdk()
      .then(() => {
        if (disposed || !containerRef.current) return;

        const { kakao } = window;
        const center = new kakao.maps.LatLng(origin.lat, origin.lng);
        const map = new kakao.maps.Map(containerRef.current, { center, level: 4 });
        (map as unknown as { setDraggable?: (enabled: boolean) => void }).setDraggable?.(true);
        (map as unknown as { setZoomable?: (enabled: boolean) => void }).setZoomable?.(true);

        const bounds = new kakao.maps.LatLngBounds();
        bounds.extend(center);
        const selectedItem = selectedPlaceId ? items.find((item) => item.place_id === selectedPlaceId) : null;
        const selectedLatLng = selectedItem ? new kakao.maps.LatLng(selectedItem.lat, selectedItem.lng) : null;
        const focusLatLng = mapFocusTarget === "origin" ? center : selectedLatLng;
        const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 980px)").matches;
        const upwardOffset = isMobile ? Math.round(Math.min(window.innerHeight * 0.18, 170)) : 0;

        const setFocusCenter = (target: unknown) => {
          if (!upwardOffset) {
            (map as unknown as { setCenter?: (latLng: unknown) => void }).setCenter?.(target);
            return;
          }

          const projection = (map as unknown as { getProjection?: () => unknown }).getProjection?.() as
            | {
                containerPointFromCoords?: (coords: unknown) => { x: number; y: number };
                coordsFromContainerPoint?: (point: unknown) => unknown;
              }
            | undefined;
          const toPoint = projection?.containerPointFromCoords;
          const toCoords = projection?.coordsFromContainerPoint;

          if (toPoint && toCoords) {
            const point = toPoint(target);
            const shiftedPoint = new kakao.maps.Point(point.x, point.y + upwardOffset);
            const shiftedCoords = toCoords(shiftedPoint);
            (map as unknown as { setCenter?: (latLng: unknown) => void }).setCenter?.(shiftedCoords);
            return;
          }

          (map as unknown as { setCenter?: (latLng: unknown) => void }).setCenter?.(target);
        };

        const originMarker = new kakao.maps.Marker({
          map,
          position: center,
          title: "내 위치",
          image: new kakao.maps.MarkerImage(pinSvg("#2d87ff"), new kakao.maps.Size(34, 34), {
            offset: new kakao.maps.Point(17, 17),
          }),
        });
        cleanups.push(() => originMarker.setMap(null));

        items.forEach((item) => {
          const position = new kakao.maps.LatLng(item.lat, item.lng);
          bounds.extend(position);

          const marker = new kakao.maps.Marker({
            map,
            position,
            title: item.name,
            clickable: true,
            image: new kakao.maps.MarkerImage(
              pinSvg(item.place_id === selectedPlaceId ? "#ffb25f" : "#f48c25"),
              new kakao.maps.Size(34, 34),
              { offset: new kakao.maps.Point(17, 17) },
            ),
          });

          const info = new kakao.maps.InfoWindow({
            content: `<div style=\"padding:6px 8px;font-size:12px;color:#23170f;\">${item.name}</div>`,
          });

          const handleClick = () => {
            onSelect(item.place_id);
            info.open(map, marker);
          };

          kakao.maps.event.addListener(marker, "click", handleClick);
          cleanups.push(() => {
            kakao.maps.event.removeListener(marker, "click", handleClick);
            info.close();
            marker.setMap(null);
          });
        });

        if (focusLatLng) {
          setFocusCenter(focusLatLng);
        } else {
          map.setBounds(bounds);
        }
        resizeTimer = setTimeout(() => {
          if (disposed) return;
          (window.kakao?.maps.event as unknown as { trigger?: (target: unknown, type: string) => void })?.trigger?.(map, "resize");
          if (focusLatLng) {
            setFocusCenter(focusLatLng);
          } else {
            map.setBounds(bounds);
          }
        }, 90);
      })
      .catch(() => {
        setFailed(true);
        onLoadFail?.();
      });

    return () => {
      disposed = true;
      if (resizeTimer) {
        clearTimeout(resizeTimer);
        resizeTimer = null;
      }
      cleanups.forEach((fn) => fn());
      cleanups = [];
    };
  }, [origin, items, selectedPlaceId, mapFocusTarget, focusNonce, onSelect, onLoadFail]);

  if (failed) {
    return <div className="map-empty">Kakao 지도 로드 실패. OSM 지도로 대체합니다.</div>;
  }

  return <div ref={containerRef} className="result-kakao-map" />;
}
