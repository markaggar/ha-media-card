# Geocoding Cache Strategy - Added to Integration Plan

## Summary (October 24, 2025)

Added comprehensive geocoding cache system to prevent redundant API calls when extracting location names from GPS coordinates in photo EXIF data.

---

## Problem Statement

**Original Issue:** With 25,000 photos containing GPS data, making individual reverse geocoding API calls for each photo would be:
- **Time-consuming:** At 1 request/second (Nominatim rate limit) = ~7 hours
- **Wasteful:** Many photos taken at same location (home, office, common parks)
- **Unnecessary:** Location names don't change frequently

---

## Solution: Geocoding Cache Table

### Database Schema Added

```sql
CREATE TABLE geocode_cache (
    id INTEGER PRIMARY KEY,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    location_name TEXT,
    location_city TEXT,
    location_state TEXT,
    location_country TEXT,
    location_country_code TEXT,
    cached_time INTEGER NOT NULL,  -- Unix timestamp when cached
    access_count INTEGER DEFAULT 1,
    last_accessed INTEGER NOT NULL,  -- Unix timestamp of last use
    UNIQUE(latitude, longitude)  -- Prevent duplicate lookups
);

CREATE INDEX idx_geocode_coords ON geocode_cache(latitude, longitude);
CREATE INDEX idx_geocode_accessed ON geocode_cache(last_accessed);
```

### Key Features

**1. Coordinate Rounding (Smart Grouping)**
- Rounds GPS coordinates to 4 decimal places (~11 meters precision)
- Groups photos taken within ~11m radius to same location name
- Example: All photos at "Green Lake Park" get same cached result
- Configurable precision (2-6 decimal places via UI)

**2. Cache-First Lookup Strategy**
```python
async def reverse_geocode(lat, lon):
    # 1. Round coordinates for cache lookup
    lat, lon = round(lat, 4), round(lon, 4)
    
    # 2. Check cache first (fast database lookup)
    cached = await get_from_cache(lat, lon)
    if cached:
        return cached  # 60-80% hit rate expected
    
    # 3. Call Nominatim API (slow, rate-limited)
    location = await call_nominatim_api(lat, lon)
    
    # 4. Save to cache for future use
    await save_to_cache(lat, lon, location)
    
    return location
```

**3. Rate Limiting (Nominatim Compliance)**
- Max 1 request/second (Nominatim free tier requirement)
- Automatic delay between API calls
- User-Agent header: `HomeAssistant-MediaIndex/1.0`
- Configurable rate limit delay (default: 1.0 seconds)

**4. Cache Statistics Tracking**
- `access_count`: How many times each cached location was used
- `cache_hits` / `cache_misses`: Effectiveness metrics
- `hit_rate_percent`: Overall cache performance
- Exposed as sensor attributes for monitoring

---

## Geocoding Service: Nominatim (OpenStreetMap)

**Why Nominatim:**
- ✅ Free (no API key required)
- ✅ No usage limits (with respectful rate limiting)
- ✅ High quality location data
- ✅ Active development and community support
- ✅ Privacy-friendly (self-hostable if needed)

**API Details:**
- **Endpoint:** `https://nominatim.openstreetmap.org/reverse`
- **Rate Limit:** 1 request/second
- **Format:** JSON response with detailed address components
- **Zoom Level:** 18 (street-level detail)

**Response Parsing:**
Extracts hierarchical location data:
1. `location_name`: Neighborhood/suburb/hamlet (most specific)
2. `location_city`: City/town
3. `location_state`: State/province
4. `location_country`: Country name
5. `location_country_code`: ISO country code (e.g., "US")

---

## Performance Expectations

### With Geocoding Cache

**For 25,000 photos with GPS data:**
- **Unique locations:** ~5,000-10,000 (60-80% cache hit rate)
- **API calls needed:** 5,000-10,000 (vs. 25,000 without cache)
- **Indexing time:** ~1.5-3 hours (vs. ~7 hours)
- **Time saved:** ~4-5.5 hours (60-70% reduction)

**Cache effectiveness factors:**
- Higher hit rate for users who revisit same locations frequently
- Lower hit rate for travel photographers with many unique locations
- Coordinate precision tuning affects grouping (4 decimals = 11m radius)

### Example Scenarios

**Scenario 1: Family photo collection (high hit rate)**
- 25,000 photos, mostly at home/school/grandparents
- Unique locations: ~200-500
- Cache hit rate: 95%+
- API calls: ~500 (vs. 25,000)
- Indexing time: ~10 minutes (vs. ~7 hours)

**Scenario 2: Travel photographer (lower hit rate)**
- 25,000 photos from 50+ countries
- Unique locations: ~8,000-12,000
- Cache hit rate: 50-70%
- API calls: ~10,000 (vs. 25,000)
- Indexing time: ~3 hours (vs. ~7 hours)

---

## Configuration Options

### Via Home Assistant UI (Integrations → Media Index → Configure)

```yaml
geocoding:
  enabled: true                # Master toggle (on/off)
  coordinate_precision: 4      # Decimal places (2-6, default: 4)
  rate_limit_delay: 1.0        # Seconds between API calls
  cache_cleanup_days: 365      # Remove unused entries after 1 year
```

**Coordinate Precision Guide:**
- `2` decimals = ~1.1 km radius (very aggressive grouping)
- `3` decimals = ~110 m radius (neighborhood-level)
- `4` decimals = ~11 m radius (street-level, **recommended**)
- `5` decimals = ~1.1 m radius (building-level)
- `6` decimals = ~0.11 m radius (nearly exact, minimal grouping)

---

## Sensor Attributes (Monitoring)

**Added to `sensor.media_index_total_files`:**

```yaml
attributes:
  # Existing attributes
  scan_status: "idle"
  last_scan_time: "2025-10-24T10:15:30"
  total_folders: 487
  cache_size_mb: 156.3
  
  # New geocoding attributes
  geocode_cache_entries: 3842        # Number of cached locations
  geocode_cache_hit_rate: 73.2       # Percentage (0-100)
  geocode_api_calls_total: 3842      # Lifetime API call count
  geocode_api_calls_session: 127     # API calls since last restart
  files_with_location: 18653         # Photos with GPS coordinates
  files_geocoded: 18653              # Photos with resolved location names
```

---

## Implementation Details

### GeocodeCache Class (geocoder.py)

**Core Methods:**
```python
class GeocodeCache:
    async def reverse_geocode(lat, lon) -> Dict
        # Main entry point - cache-first lookup
    
    async def _get_from_cache(lat, lon) -> Optional[Dict]
        # Database lookup with access tracking
    
    async def _save_to_cache(lat, lon, location)
        # Store result in SQLite cache
    
    def _round_coords(lat, lon) -> tuple
        # Round to configured precision
    
    def _parse_nominatim_response(data) -> Dict
        # Extract location fields from API response
    
    def get_cache_stats() -> Dict
        # Return cache effectiveness metrics
```

### Integration with EXIF Extraction

```python
# exif_parser.py
async def extract_and_geocode(file_path: str) -> Dict:
    """Extract EXIF and optionally geocode GPS coordinates."""
    
    exif_data = await self._extract_exif(file_path)
    
    # If GPS data present and geocoding enabled
    if exif_data.get('latitude') and self.config.geocode_enabled:
        location = await self.geocoder.reverse_geocode(
            exif_data['latitude'],
            exif_data['longitude']
        )
        if location:
            exif_data.update(location)  # Add location_name, city, country
    
    return exif_data
```

### Cache Cleanup (Optional Housekeeping)

```python
async def cleanup_old_geocode_cache():
    """Remove rarely-accessed cache entries (optional)."""
    cutoff = int(time.time()) - (365 * 86400)  # 1 year ago
    
    await db.execute(
        "DELETE FROM geocode_cache WHERE last_accessed < ?",
        (cutoff,)
    )
```

---

## Reconfiguration Support

**Dynamic Settings (no restart required):**
- ✅ Enable/disable geocoding
- ✅ Change coordinate precision (affects future lookups only)
- ✅ Adjust rate limit delay
- ✅ Update cache cleanup age

**When geocoding is disabled:**
- Existing cached location names are preserved
- No new API calls are made
- GPS coordinates still extracted from EXIF
- Location fields remain empty for new photos

**When coordinate precision changes:**
- Existing cache remains valid
- Future lookups use new precision
- May result in more/fewer cache hits depending on direction

---

## Testing Strategy

### Unit Tests

```python
# tests/test_geocoder.py
async def test_coordinate_rounding():
    geocoder = GeocodeCache(db_path)
    lat, lon = geocoder._round_coords(47.606209, -122.332069)
    assert lat == 47.6062
    assert lon == -122.3321

async def test_cache_hit():
    # Pre-populate cache
    await geocoder._save_to_cache(47.6062, -122.3321, {
        'location_name': 'Seattle',
        'location_city': 'Seattle',
        'location_country': 'United States'
    })
    
    # Should hit cache without API call
    result = await geocoder.reverse_geocode(47.606209, -122.332069)
    assert result['location_name'] == 'Seattle'
    assert geocoder._cache_hits == 1

async def test_rate_limiting():
    # Ensure 1 second delay between calls
    start = time.time()
    await geocoder.reverse_geocode(47.6062, -122.3321)
    await geocoder.reverse_geocode(47.6063, -122.3322)
    elapsed = time.time() - start
    assert elapsed >= 1.0  # At least 1 second delay
```

### Integration Tests

```powershell
# Deploy and verify geocoding works
.\scripts\deploy-media-index.ps1 -VerifyEntity "sensor.media_index_total_files"

# Check sensor attributes include geocoding stats
$state = Invoke-RestMethod -Uri "http://10.0.0.26:8123/api/states/sensor.media_index_total_files" `
    -Headers @{Authorization="Bearer $env:HA_TOKEN"}

$attrs = $state.attributes
Write-Host "Geocode cache entries: $($attrs.geocode_cache_entries)"
Write-Host "Cache hit rate: $($attrs.geocode_cache_hit_rate)%"
Write-Host "Files with location: $($attrs.files_with_location)"
```

---

## Files Modified

### MEDIA_INDEX_INTEGRATION_PLAN.md

**Added Sections:**
1. **Geocode Cache Table Schema** (after `scan_history` table)
   - Database schema with indexes
   - Cache notes explaining rounding strategy
   - Lines added: ~25

2. **Geocoding Strategy** (new section, ~200 lines)
   - Service provider rationale (Nominatim)
   - Complete `GeocodeCache` class implementation
   - Rate limiting logic
   - Coordinate rounding explanation
   - Cache statistics tracking
   - Integration with EXIF extraction
   - Performance expectations with real-world scenarios

3. **Configuration Example** (updated)
   - Added `geocoding:` section with 4 settings
   - Lines added: ~6

4. **Reconfigurable Settings** (updated)
   - Added 2 geocoding-related settings
   - Implementation note about preserving cache when disabled
   - Lines added: ~3

5. **Sensor Attributes** (updated)
   - Added 3 geocoding-related attributes
   - Updated example output to include geocoding stats
   - Lines added: ~5

**Total additions:** ~240 lines

---

## Benefits of This Approach

### 1. Performance
- ✅ 60-80% reduction in API calls
- ✅ 60-70% reduction in indexing time
- ✅ Fast cache lookups (<1ms vs. 1000ms API call)
- ✅ No performance degradation on subsequent scans

### 2. Reliability
- ✅ Survives API outages (uses cached data)
- ✅ Reduces API rate limit pressure
- ✅ No duplicate work on restarts

### 3. Privacy & Cost
- ✅ Fewer external API calls
- ✅ Free service (Nominatim) scales better with caching
- ✅ Self-hostable Nominatim instance possible if needed

### 4. User Experience
- ✅ Faster initial scans
- ✅ Configurable precision (trade accuracy vs. cache hits)
- ✅ Visible cache statistics for monitoring
- ✅ No manual intervention required

### 5. Sustainability
- ✅ Respectful use of free Nominatim service
- ✅ Automatic rate limiting compliance
- ✅ Cache cleanup prevents unbounded growth

---

## Next Steps

1. ✅ **Documentation complete** - Geocoding cache fully specified
2. ⏳ **Implementation** - Phase 5 (days 12-14) of integration development
3. ⏳ **Testing** - Unit tests for cache logic, integration tests for Nominatim API
4. ⏳ **Monitoring** - Expose cache statistics via sensor attributes
5. ⏳ **Optimization** - Fine-tune coordinate precision based on user feedback

---

## References

- **Nominatim Documentation:** https://nominatim.org/release-docs/latest/
- **Nominatim Usage Policy:** https://operations.osmfoundation.org/policies/nominatim/
- **GPS Precision Guide:** 
  - 4 decimal places = 11.1 meters (recommended)
  - https://en.wikipedia.org/wiki/Decimal_degrees#Precision
