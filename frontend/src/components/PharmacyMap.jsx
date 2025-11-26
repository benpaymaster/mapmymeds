import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const CARDIFF_CENTER = [51.4816, -3.1791];
const RADIUS_KM = 2;


function haversineDistance(lat1, lon1, lat2, lon2) {
  function toRad(x) { return x * Math.PI / 180; }
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const PharmacyMap = () => {
  const [pharmacies, setPharmacies] = useState([]);
  const [userLocation, setUserLocation] = useState("");
  const [center, setCenter] = useState(CARDIFF_CENTER);
  const [filteredPharmacies, setFilteredPharmacies] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/src/data/cardiff_pharmacies.json")
      .then((res) => res.json())
      .then((data) => setPharmacies(data))
      .catch(() => setError("Failed to load pharmacy data."));
  }, []);

  useEffect(() => {
    if (center && pharmacies.length > 0) {
      const filtered = pharmacies.filter(pharmacy => {
        const dist = haversineDistance(center[0], center[1], pharmacy.latitude, pharmacy.longitude);
        return dist <= RADIUS_KM;
      });
      setFilteredPharmacies(filtered);
    }
  }, [center, pharmacies]);

  const handleLocationSearch = async (e) => {
    e.preventDefault();
    setError("");
    if (!userLocation) {
      setError("Please enter a location.");
      return;
    }
    // Geocode using Nominatim
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(userLocation + ', Cardiff')}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.length > 0) {
        setCenter([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
      } else {
        setError("Location not found. Please try a different address or postcode.");
      }
    } catch {
      setError("Failed to search for location.");
    }
  };

  return (
    <div>
      <form onSubmit={handleLocationSearch} style={{ marginBottom: "1em" }} aria-label="Location search form">
        <label htmlFor="location-input">
          Enter your location (address or postcode):
        </label>
        <input
          id="location-input"
          type="text"
          value={userLocation}
          onChange={e => setUserLocation(e.target.value)}
          style={{ marginLeft: "1em" }}
          aria-required="true"
        />
        <button type="submit" style={{ marginLeft: "1em" }} aria-label="Search for nearby pharmacies">Search</button>
      </form>
      {error && <div role="alert" style={{ color: "red", marginBottom: "1em" }}>{error}</div>}
      <MapContainer center={center} zoom={13} style={{ height: "500px", width: "100%" }} aria-label="Pharmacy map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {filteredPharmacies.length === 0 ? (
          <Popup position={center}>
            <span>No pharmacies found within {RADIUS_KM}km.</span>
          </Popup>
        ) : (
          filteredPharmacies.map((pharmacy, idx) => (
            <Marker key={idx} position={[pharmacy.latitude, pharmacy.longitude]} tabIndex={0} aria-label={`Pharmacy: ${pharmacy.name}`}>
              <Popup>
                <strong>{pharmacy.name}</strong><br />
                {pharmacy.address}
              </Popup>
            </Marker>
          ))
        )}
      </MapContainer>
      <p aria-live="polite">{filteredPharmacies.length} pharmacies found within {RADIUS_KM}km.</p>
    </div>
  );
};

export default PharmacyMap;
