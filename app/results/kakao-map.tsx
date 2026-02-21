"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n/config";
import { t as translate } from "@/lib/i18n/messages";
import type { RecommendationItem } from "@/lib/reco/types";

type Position = { lat: number; lng: number };

type SheetSnap = "collapsed" | "half" | "expanded";

type Props = {
  origin: Position;
  items: RecommendationItem[];
  selectedPlaceId: string | null;
  mapFocusTarget: "selected" | "origin";
  focusNonce: number;
  sheetSnap?: SheetSnap;
  locale: Locale;
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

function sheetHeightPx(snap?: SheetSnap): number {
  if (snap === "half") return 372;
  if (snap === "collapsed") return 176;
  return 0;
}

export default function KakaoMap({
  origin,
  items,
  selectedPlaceId,
  mapFocusTarget,
  focusNonce,
  sheetSnap,
  locale,
  onSelect,
  onLoadFail,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown | null>(null);
  const markerCleanupsRef = useRef<Array<() => void>>([]);
  const [mapReady, setMapReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const clearMarkers = useCallback(() => {
    markerCleanupsRef.current.forEach((cleanup) => cleanup());
    markerCleanupsRef.current = [];
  }, []);

  const setFocusCenter = useCallback((map: unknown, target: unknown, upwardOffsetPx: number) => {
    (map as unknown as { setCenter?: (latLng: unknown) => void }).setCenter?.(target);
    if (upwardOffsetPx) {
      (map as unknown as { panBy?: (x: number, y: number) => void }).panBy?.(0, upwardOffsetPx);
    }
  }, []);

  const focusMapTarget = useCallback(
    (map: unknown, bounds: unknown) => {
      const { kakao } = window;
      const selectedItem = selectedPlaceId ? items.find((item) => item.place_id === selectedPlaceId) : null;
      const selectedLatLng = selectedItem ? new kakao.maps.LatLng(selectedItem.lat, selectedItem.lng) : null;
      const focusLatLng = mapFocusTarget === "origin" ? new kakao.maps.LatLng(origin.lat, origin.lng) : selectedLatLng;
      const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 980px)").matches;
      const upwardOffsetPx = isMobile ? Math.round(sheetHeightPx(sheetSnap) / 2) : 0;

      if (focusLatLng) {
        setFocusCenter(map, focusLatLng, upwardOffsetPx);
      } else {
        (map as unknown as { setBounds?: (nextBounds: unknown) => void }).setBounds?.(bounds);
      }
    },
    [items, mapFocusTarget, origin.lat, origin.lng, selectedPlaceId, setFocusCenter, sheetSnap],
  );

  useEffect(() => {
    let disposed = false;

    if (!containerRef.current || !KAKAO_KEY) {
      setFailed(true);
      onLoadFail?.();
      return;
    }

    void loadKakaoSdk()
      .then(() => {
        if (disposed || !containerRef.current) return;

        const { kakao } = window;
        if (!mapRef.current) {
          mapRef.current = new kakao.maps.Map(containerRef.current, {
            center: new kakao.maps.LatLng(origin.lat, origin.lng),
            level: 4,
          });
        }

        const map = mapRef.current;
        (map as unknown as { setDraggable?: (enabled: boolean) => void }).setDraggable?.(true);
        (map as unknown as { setZoomable?: (enabled: boolean) => void }).setZoomable?.(true);
        setFailed(false);
        setMapReady(true);
      })
      .catch(() => {
        if (disposed) return;
        setFailed(true);
        onLoadFail?.();
      });

    return () => {
      disposed = true;
    };
  }, [onLoadFail, origin.lat, origin.lng]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.kakao?.maps) return;

    const { kakao } = window;
    const map = mapRef.current;
    clearMarkers();

    const center = new kakao.maps.LatLng(origin.lat, origin.lng);
    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(center);

    const originMarker = new kakao.maps.Marker({
      map,
      position: center,
      title: translate(locale, "results.location.current"),
      image: new kakao.maps.MarkerImage(pinSvg("#2d87ff"), new kakao.maps.Size(34, 34), {
        offset: new kakao.maps.Point(17, 17),
      }),
    });
    markerCleanupsRef.current.push(() => originMarker.setMap(null));

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

      const content = document.createElement("div");
      content.style.padding = "6px 8px";
      content.style.fontSize = "12px";
      content.style.color = "#23170f";
      content.textContent = item.name;

      const info = new kakao.maps.InfoWindow({ content });
      const handleClick = () => {
        onSelect(item.place_id);
        info.open(map, marker);
      };

      kakao.maps.event.addListener(marker, "click", handleClick);
      markerCleanupsRef.current.push(() => {
        kakao.maps.event.removeListener(marker, "click", handleClick);
        info.close();
        marker.setMap(null);
      });
    });

    focusMapTarget(map, bounds);
    const resizeTimer = setTimeout(() => {
      (window.kakao?.maps.event as unknown as { trigger?: (target: unknown, type: string) => void })?.trigger?.(map, "resize");
      focusMapTarget(map, bounds);
    }, 90);

    return () => {
      clearTimeout(resizeTimer);
      clearMarkers();
    };
  }, [
    mapReady,
    clearMarkers,
    focusMapTarget,
    focusNonce,
    items,
    locale,
    onSelect,
    origin.lat,
    origin.lng,
    selectedPlaceId,
  ]);

  useEffect(() => {
    return () => {
      clearMarkers();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [clearMarkers]);

  if (failed) {
    return <div className="map-empty">{translate(locale, "results.mapLoadFailedFallback")}</div>;
  }

  return <div ref={containerRef} className="result-kakao-map" />;
}
