
import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// DrugMap: Interactive map for global drug availability
// Features (MVP):
// - World/city map with pharmacy/clinic markers
// - Search bar for drug name/location
// - Marker popups show available drugs, quantities, expiry dates
// - Color-coded markers for soon-to-expire drugs
// - Placeholder for messaging/notification actions

const DEFAULT_CENTER = [51.4816, -3.1791]; // Cardiff as default
const DEFAULT_ZOOM = 13;

const DrugMap = () => {
  const [pharmacies, setPharmacies] = useState([]);
  const [search, setSearch] = useState("");
  const [center, setCenter] = useState(DEFAULT_CENTER);

  useEffect(() => {
    fetch("/src/data/cardiff_pharmacies.json")
      .then((res) => res.json())
      .then((data) => setPharmacies(data));
  }, []);

  // TODO: Replace with global search and inventory integration
  const filtered = pharmacies.filter((pharmacy) =>
    pharmacy.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full h-[600px] bg-gray-100 rounded-lg shadow p-4">
      <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between">
        <h2 className="text-2xl font-bold">Global Drug Availability Map</h2>
        <input
          type="text"
          placeholder="Search for a drug or location..."
          className="mt-2 md:mt-0 border rounded px-3 py-2 w-full md:w-80"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <MapContainer center={center} zoom={DEFAULT_ZOOM} style={{ height: "500px", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filtered.map((pharmacy, idx) => (
          <Marker key={idx} position={[pharmacy.latitude, pharmacy.longitude]}>
            <Popup>
              <strong>{pharmacy.name}</strong><br />
              {pharmacy.address}
              {/* TODO: Show available drugs, expiry, and actions */}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default DrugMap;
