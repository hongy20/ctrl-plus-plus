# Domain Spec: Official Vehicle Profile Catalog (`profile`)

- **Status:** Approved v1.0 (Static Catalog of Official LEGO Technic Set Parameters)
- **Stack:** TypeScript (Read-only static catalog, `vitest`)

---

## 1. Official LEGO Set Catalog

| Set ID | Name | Hub Type | Drive Port | Drive Polarity | Steer Port | Stock Tire Ø (`mm`) | Default Steer Clamp | Default Brake Intensity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`42124`** | **Off-Road Buggy** *(Default)* | `TechnicHub 88012` | Port A (`0x00`) | `-1` (CCW = Forward) | Port B (`0x01`) | `71.6` | `0.90` (90%) | `0.60` (60%) |

*(Future sets such as `42099 4x4 X-treme Off-Roader` or `42160 Audi RS Q e-tron` can be added as static catalog entries without changing control logic.)*

---

## 2. EARS Behavioral Requirements

### Static Profile Catalog & Lookup
- **PRF-01:** `THE System SHALL provide a read-only catalog of official LEGO vehicle profiles (listVehicleProfiles(), getVehicleProfile(setId)) containing each set's setId, displayName, hubType, drivePort, drivePolarity, steerPort, stockTireDiameterMm, defaultSteeringClampRatio, and defaultBrakeIntensity.`
- **PRF-02:** `WHEN an unknown Hub connects or no setId is specified, THE System SHALL default to the "42124" (Off-Road Buggy) vehicle profile.`

---

## 3. Verification Plan
1. **Unit Tests (`tests/profile-storage.test.ts`):** Verify `listVehicleProfiles()` returns the `42124 Off-Road Buggy` baseline with exact stock hardware parameters (`71.6mm` tire Ø, Port A CCW drive, Port B steer) and `getVehicleProfile()` falls back to `42124` when given an unknown ID.
