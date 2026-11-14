# Domain Spec: Hub Profile Storage (`storage`)

- **Status:** Approved v2.0 (Per-Hub `localStorage` CRUD combining Vehicle Profile, Calibration & User Tweaks)
- **Dependencies:** [`docs/specs/profile.md`](profile.md) (`PRF-01`, `PRF-02`), [`docs/specs/calibration.md`](calibration.md) (`CAL-01`..`CAL-03`)
- **Stack:** TypeScript (`localStorage`, `vitest`)

---

## 1. Hub Profile Lifecycle (`localStorage`)

```text
[Hub Identified by hubId] ──► getOrCreateHubProfile(hubId, name) (STR-01)
      │
      ├──► Known hubId:   Return persisted HubProfile from localStorage
      └──► Unknown hubId: Initialize from selected Official Vehicle Profile (PRF-02: "42124")
             │
             ├──► Update via Calibration (CAL-02 steering limits, CAL-03 kCal) (STR-02)
             ├──► Update via User Parameter Tweaks (tireDiameterMm, brakeIntensity, etc.) (STR-03)
             └──► Manage Registry: listRememberedHubs(), resetHubCalibration(hubId), forgetHub(hubId) (STR-04)
```

---

## 2. EARS Behavioral Requirements

### Per-Hub Profile Creation & Retrieval
- **STR-01:** `WHEN getOrCreateHubProfile(hubId, name, setId?) is called, THE System SHALL return the existing HubProfile from localStorage if present (updating lastConnectedAt only, never overwriting the stored name), or create and persist a new HubProfile with name seeded from the Hub's advertised name, a random ledColor from the LWP Hub LED colors excluding Off (1..10), the stock parameters of the selected Official Vehicle Profile (defaulting to "42124" per PRF-02), and uncalibrated defaults (kCal = 1.0).`

### Calibration & Parameter Persistence
- **STR-02:** `WHEN saveHubCalibration(hubId, patch) is called after a steering or speed calibration routine, THE System SHALL merge the new calibration values (leftLimit, rightLimit, centerPos, or kCal) into that Hub's persisted HubProfile in localStorage.`
- **STR-03:** `WHEN updateHubParameters(hubId, patch) is called, THE System SHALL validate and persist user-tweaked overrides (name, ledColor, setId, tireDiameterMm, steeringClampRatio, defaultBrakeIntensity) in localStorage so custom Hub names and tuning persist locally without writing to physical Hub flash.`

### Remembered Hubs Registry Management
- **STR-04:** `THE System SHALL provide listRememberedHubs() (sorted by lastConnectedAt descending), resetHubCalibration(hubId) (restoring stock Vehicle Profile defaults and clearing calibration), and forgetHub(hubId) (removing the HubProfile from localStorage).`

---

## 3. Verification Plan
1. **Unit Tests (`tests/profile-storage.test.ts`):** Verify `localStorage` CRUD operations (`STR-01`..`STR-04`): seeding an unknown `hubId` from `42124` with a random non-Off `ledColor`, preserving a stored nickname on reconnect, persisting calibration patches, overriding `tireDiameterMm` / `defaultBrakeIntensity`, resetting calibration back to stock preset, and deleting a remembered hub.
