"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
type Point = { latitude: number; longitude: number };
export default function Map({
  center,
  raw,
  selected,
  onMove,
  records = [],
  normal = 100,
  review = 300,
}: {
  center: Point;
  raw?: Point;
  selected?: Point;
  onMove?: (p: Point) => void;
  records?: any[];
  normal?: number;
  review?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const move = useRef(onMove);
  move.current = onMove;
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current).setView(
      [center.latitude, center.longitude],
      17,
    );
    map.current = m;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(m);
    L.circle([center.latitude, center.longitude], {
      radius: review,
      color: "#d89b34",
      fillOpacity: 0.035,
    }).addTo(m);
    L.circle([center.latitude, center.longitude], {
      radius: normal,
      color: "#138b78",
      fillOpacity: 0.08,
    }).addTo(m);
    L.circleMarker([center.latitude, center.longitude], {
      radius: 8,
      color: "#163e38",
      fillOpacity: 1,
    })
      .addTo(m)
      .bindTooltip("Classroom");
    if (raw)
      L.circleMarker([raw.latitude, raw.longitude], {
        radius: 6,
        color: "#6c7f92",
        fillOpacity: 0.7,
      })
        .addTo(m)
        .bindTooltip("Original GPS");
    if (selected) {
      const marker = L.marker([selected.latitude, selected.longitude], {
        draggable: !!onMove,
        icon: L.divIcon({
          className: "location-pin",
          html: "<span></span>",
          iconSize: [22, 22],
        }),
      }).addTo(m);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        move.current?.({ latitude: p.lat, longitude: p.lng });
      });
    }
    for (const r of records) {
      if (r.corrected_latitude == null) continue;
      const dot = L.circleMarker(
        [r.corrected_latitude, r.corrected_longitude],
        {
          radius: 7,
          color:
            r.status === "NORMAL"
              ? "#138b78"
              : r.status === "REVIEW"
                ? "#d89b34"
                : "#ce4b4b",
          fillOpacity: 0.8,
        },
      ).addTo(m);
      dot.bindTooltip(`${r.student_id}: ${r.status}`);
    }
    if (raw) {
      m.fitBounds(L.latLngBounds([center.latitude, center.longitude], [raw.latitude, raw.longitude]), { padding: [35, 35], maxZoom: 17 });
    }
    const t = setTimeout(() => m.invalidateSize(), 100);
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
    };
  }, [
    center.latitude,
    center.longitude,
    raw?.latitude,
    raw?.longitude,
    selected?.latitude,
    selected?.longitude,
    records,
    normal,
    review,
  ]);
  return <div ref={el} className="map" aria-label="Attendance location map" />;
}
