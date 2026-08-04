import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

/**
 * Expects `rows` in the exact shape PatientView already computes:
 *   [{ node: {id, postcode, pharmacy, area, lat, lng, phone}, stock: {level, trend, cost}, distanceMi }]
 * so this stays a pure presentation layer — no data logic duplicated here.
 */

const LEVEL_COLOR = {
  out: '#fb7185',    // rose-400 — matches the card badges in list view
  low: '#fbbf24',    // amber-400
  medium: '#34d399', // emerald-400
  high: '#34d399',
};

const LEVEL_LABEL = { out: 'Out of stock', low: 'Low stock', medium: 'In stock', high: 'Well stocked' };
const TREND_ARROW = { rising: '▲', falling: '▼', steady: '–' };
const TREND_COLOR = { rising: '#34d399', falling: '#fb7185', steady: '#94a3b8' };

function pharmacyIcon(stock) {
  const color = LEVEL_COLOR[stock.level];
  // Falling + low/out gets a pulsing ring — the same "don't drive over for nothing" signal as the card warning.
  const urgent = stock.trend === 'falling' && (stock.level === 'low' || stock.level === 'out');
  const ring = urgent
    ? `<span style="position:absolute; inset:-6px; border-radius:50%; border:2px solid ${color}; opacity:0.6; animation: mmm-pulse 1.6s ease-out infinite;"></span>`
    : '';
  return L.divIcon({
    className: 'mmm-marker',
    html: `
      <div style="position:relative; width:26px; height:26px;">
        ${ring}
        <div style="width:26px; height:26px; border-radius:50%; background:${color}; border:2.5px solid #0f172a; box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

// Distinct from pharmacy pins so it reads as "you" at a glance, Uber-rider-pin style.
function userIcon() {
  return L.divIcon({
    className: 'mmm-user-marker',
    html: `
      <div style="position:relative; width:20px; height:20px;">
        <span style="position:absolute; inset:-8px; border-radius:50%; background:#60a5fa; opacity:0.25; animation: mmm-pulse 2s ease-out infinite;"></span>
        <div style="width:20px; height:20px; border-radius:50%; background:#3b82f6; border:3px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Keeps the map re-centered when Bob's location resolves after the initial render
// (geolocation is async, so the map often mounts before we have real coords).
function RecenterOnLocate({ coords }) {
  const map = useMap();
  useEffect(() => {
    map.setView([coords.lat, coords.lng], map.getZoom());
  }, [coords.lat, coords.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function MapView({ rows, medName, userCoords, selectedNodeId, onSelectNode }) {
  return (
    <div style={{ width: '100%', height: 420, borderRadius: 12, overflow: 'hidden' }}>
      <style>{`
        @keyframes mmm-pulse {
          0% { transform: scale(0.8); opacity: 0.7; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .leaflet-popup-content-wrapper { background: #0f172a; color: #e2e8f0; border-radius: 10px; }
        .leaflet-popup-tip { background: #0f172a; }
        .leaflet-container { background: #1e293b; }
      `}</style>
      <MapContainer center={[userCoords.lat, userCoords.lng]} zoom={13} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnLocate coords={userCoords} />

        <Marker position={[userCoords.lat, userCoords.lng]} icon={userIcon()}>
          <Popup>
            <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
              <strong>You are here</strong>
            </div>
          </Popup>
        </Marker>

        {rows.map(({ node, stock, distanceMi }) => {
          const driveMin = Math.max(2, Math.round(distanceMi * 3));
          return (
            <Marker
              key={node.id}
              position={[node.lat, node.lng]}
              icon={pharmacyIcon(stock)}
              eventHandlers={{ click: () => onSelectNode?.(node.id) }}
            >
              <Popup>
                <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 13, minWidth: 170 }}>
                  <strong>{node.pharmacy}</strong><br />
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{node.postcode} · {node.area}</span>
                  <div style={{ margin: '6px 0', fontSize: 12 }}>
                    {distanceMi} mi · ~{driveMin} min drive
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ color: LEVEL_COLOR[stock.level], fontWeight: 600, fontSize: 12 }}>
                      {LEVEL_LABEL[stock.level]}
                    </span>
                    <span style={{ color: TREND_COLOR[stock.trend], fontWeight: 600, fontSize: 12 }}>
                      {TREND_ARROW[stock.trend]} {stock.trend}
                    </span>
                  </div>
                  {stock.trend === 'falling' && (stock.level === 'low' || stock.level === 'out') && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#fda4af', lineHeight: 1.4 }}>
                      Stock is dropping — call ahead before you travel.
                    </div>
                  )}
                  <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>{medName}</div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}