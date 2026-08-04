import React from 'react';

export default function SearchBar({ selectedMedicine, setSelectedMedicine }) {
  const medicines = [
    "Atorvastatin 20mg",
    "Amlodipine 5mg",
    "Lansoprazole 30mg",
    "Ramipril 5mgs",
    "Omeprazole 20mg",
    "Levothyroxine sodium 50mcg",
    "Bisoprolol fumarate 2.5mg",
    "Colecalciferol 1000unit",
    "Metformin hydrochloride 500mg",
    "Sertraline hydrochloride 50mg"
  ];

  return (
    <div>
      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>Search Prescribed Medicine (Top 10 NHS Volumes):</label>
      <select 
        value={selectedMedicine} 
        onChange={(e) => setSelectedMedicine(e.target.value)}
        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '1em' }}
      >
        {medicines.map((med, index) => (
          <option key={index} value={med}>{med}</option>
        ))}
      </select>
    </div>
  );
}