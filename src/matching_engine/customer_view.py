"""
Customer-facing medication search with aggregated stock visibility.
Refactored for ZK-privacy integration via MapMyMeds Protocol.
"""

from typing import List, Dict, Optional
from dataclasses import dataclass
from enum import Enum
import asyncio
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, asin

# Importing your new protocol modules
from src.protocol.privacy import ZKPrivacyGuard

class StockStatus(Enum):
    IN_STOCK = "in_stock"
    LOW_STOCK = "low_stock"
    OUT_OF_STOCK = "out_of_stock"
    EXPIRING_SOON = "expiring_soon"

@dataclass
class PharmacyLocation:
    pharmacy_id: str
    name: str
    address: str
    latitude: float
    longitude: float
    phone: Optional[str] = None

@dataclass
class MedicationAvailability:
    snomed_code: str
    medication_name: str
    pharmacies: List[Dict]
    total_pharmacies: int
    nearest_distance_km: Optional[float]
    status: StockStatus

class CustomerSearchEngine:
    def __init__(self):
        self.pharmacies: Dict[str, PharmacyLocation] = {}
        self.inventory_cache: Dict[str, List[Dict]] = {}
        self.privacy = ZKPrivacyGuard()
    
    async def search_medication(self, snomed_code: str, user_location: Optional[tuple] = None, radius_km: int = 10, scope: str = "local") -> MedicationAvailability:
        matching_pharmacies = await self._get_matching_pharmacies(snomed_code)
        
        if user_location and scope == "local":
            matching_pharmacies = self._filter_by_distance(matching_pharmacies, user_location, radius_km)
        
        aggregated = self._aggregate_stock_status(matching_pharmacies)
        nearest_distance = self._calculate_nearest_distance(matching_pharmacies, user_location) if user_location and matching_pharmacies else None
        
        return MedicationAvailability(
            snomed_code=snomed_code,
            medication_name=await self._get_medication_name(snomed_code),
            pharmacies=aggregated,
            total_pharmacies=len(matching_pharmacies),
            nearest_distance_km=nearest_distance,
            status=self._determine_overall_status(aggregated)
        )
    
    async def _get_matching_pharmacies(self, snomed_code: str) -> List[Dict]:
        return self.inventory_cache.get(snomed_code, [])
    
    def _filter_by_distance(self, pharmacies: List[Dict], user_location: tuple, radius_km: int) -> List[Dict]:
        filtered = []
        user_lat, user_lon = user_location
        for pharmacy in pharmacies:
            pharmacy_loc = self.pharmacies.get(pharmacy['pharmacy_id'])
            if pharmacy_loc:
                distance = self._haversine_distance(user_lat, user_lon, pharmacy_loc.latitude, pharmacy_loc.longitude)
                if distance <= radius_km:
                    filtered.append({**pharmacy, 'distance_km': distance})
        return filtered
    
    def _aggregate_stock_status(self, pharmacies: List[Dict]) -> List[Dict]:
        aggregated = []
        for pharmacy in pharmacies:
            raw_qty = pharmacy.get('quantity', 0)
            is_avail = raw_qty > 0
            
            # Privacy Integration: Generate ZK-Proof instead of exposing quantity
            proof = self.privacy.generate_availability_proof(pharmacy['pharmacy_id'], is_avail)
            
            status = self._quantity_to_status(raw_qty, pharmacy.get('expiry_date'))
            
            aggregated.append({
                'pharmacy_id': pharmacy['pharmacy_id'],
                'name': self.pharmacies.get(pharmacy['pharmacy_id'], {}).get('name', 'Unknown'),
                'address': self.pharmacies.get(pharmacy['pharmacy_id'], {}).get('address', ''),
                'status': status.value,
                'proof': proof,  # Proof injected here for the protocol
                'distance_km': pharmacy.get('distance_km')
            })
        return aggregated
    
    def _quantity_to_status(self, quantity: int, expiry_date: Optional[str] = None) -> StockStatus:
        if quantity == 0: return StockStatus.OUT_OF_STOCK
        if expiry_date:
            try:
                expiry = datetime.fromisoformat(expiry_date)
                if expiry - datetime.now() <= timedelta(days=30): return StockStatus.EXPIRING_SOON
            except: pass
        return StockStatus.LOW_STOCK if quantity < 5 else StockStatus.IN_STOCK

    def _determine_overall_status(self, aggregated: List[Dict]) -> StockStatus:
        if not aggregated: return StockStatus.OUT_OF_STOCK
        statuses = [item['status'] for item in aggregated]
        if StockStatus.OUT_OF_STOCK.value in statuses and len(statuses) == 1: return StockStatus.OUT_OF_STOCK
        return StockStatus.LOW_STOCK if StockStatus.LOW_STOCK.value in statuses else StockStatus.IN_STOCK

    def _haversine_distance(self, lat1, lon1, lat2, lon2) -> float:
        R = 6371
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        dlat, dlon = lat2 - lat1, lon2 - lon1
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        return R * 2 * asin(sqrt(a))
    
    def _calculate_nearest_distance(self, pharmacies: List[Dict], user_location: tuple) -> float:
        return min([p.get('distance_km', float('inf')) for p in pharmacies]) if pharmacies else None
    
    async def _get_medication_name(self, snomed_code: str) -> str:
        return f"Medication {snomed_code}"
    
    def register_pharmacy(self, pharmacy: PharmacyLocation):
        self.pharmacies[pharmacy.pharmacy_id] = pharmacy
    
    async def update_inventory(self, pharmacy_id: str, snomed_code: str, quantity: int, expiry_date: Optional[str] = None):
        if snomed_code not in self.inventory_cache: self.inventory_cache[snomed_code] = []
        existing = next((p for p in self.inventory_cache[snomed_code] if p['pharmacy_id'] == pharmacy_id), None)
        if existing:
            existing['quantity'] = quantity
            existing['expiry_date'] = expiry_date
        else:
            self.inventory_cache[snomed_code].append({'pharmacy_id': pharmacy_id, 'quantity': quantity, 'expiry_date': expiry_date})