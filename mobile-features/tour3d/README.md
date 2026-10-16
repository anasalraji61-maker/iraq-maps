# @iraq-maps/feature-tour3d

Virtual 3D walkthroughs of Iraqi heritage sites and landmarks. This feature is **reserved for a later phase**
— only contracts and stubs exist. Do not implement screens until the tour3d milestone is active.

---

## What This Package Will Do (Planned)

- Browse a list of 3D scenes: heritage sites, mosques, markets, parks, museums.
- Open a scene and navigate between viewpoints using a 360° photo/video viewer or a 3D model renderer.
- View annotations at each viewpoint: info panels, linked places, food spots, historic notes.
- Save scenes to the activity/bookmarks list.
- Play audio narration per viewpoint in Arabic, Kurdish Sorani, and English.

---

## Current State

This package currently contains:

- `package.json` — workspace package definition
- `src/index.ts` — empty exports (placeholder)
- `README.md` — this file

The contracts are defined and frozen in `packages/contracts/src/tour3d.ts`. Implement against those types
when the milestone opens.

**Do not add screens, components, or dependencies to this package until the tour3d milestone.**

---

## Planned Screens

| Export              | Route              | Description                                       |
|---------------------|--------------------|---------------------------------------------------|
| `Tour3DListScreen`  | `/tour3d`          | Browse scenes by city and category                |
| `Tour3DSceneScreen` | `/tour3d/[id]`     | Immersive scene viewer with annotation overlays   |

---

## Ports to Consume

| Port               | Package                | Used for                                 |
|--------------------|------------------------|------------------------------------------|
| `tour3dContract`   | `@iraq-maps/contracts` | List scenes, get scene details           |
| `mediaContract`    | `@iraq-maps/contracts` | Signed URLs for 360° photo/video assets  |
| `placesContract`   | `@iraq-maps/contracts` | Resolve linked place IDs in annotations  |

---

## Environment Variables (Planned)

None beyond the shared `EXPO_PUBLIC_API_URL`. 3D scene assets are served via signed CDN URLs returned by
`GET /v1/media/assets/:assetId/read-url` — no separate CDN key needed in the mobile app.

---

## i18n Namespaces (Planned)

Namespace: `feature-tour3d`

Will use:
- `ar.json` — Arabic
- `ckb.json` — Kurdish Sorani
- `en.json` — English

Key groups: `scene.*`, `category.*`, `annotation.*`, `viewer.*`, `audio.*`

---

## Scene Categories (Planned)

| Category (API) | Label AR | Label EN |
|----------------|----------|----------|
| `heritage` | تراث | Heritage |
| `mosque` | مساجد | Mosques |
| `museum` | متاحف | Museums |
| `market` | أسواق | Markets |
| `park` | حدائق | Parks |
| `landmark` | معالم | Landmarks |

---

## Viewer Technology Decision (Pending)

The 3D viewer implementation is not decided. An ADR must be written when the milestone opens, choosing
between:

1. **`react-native-panorama-view`** — for 360° photo panoramas (gyroscope + touch navigation).
2. **`expo-three` + `three.js`** — for 3D model rendering (glTF / USDZ).
3. **Custom WebView wrapper with `three.js`** — if native bindings prove insufficient.
4. **Expo GL + reanimated** — for custom GL rendering pipeline.

The choice depends on the asset format used by the content production team. File the ADR as
`docs/adr/NNNN-tour3d-viewer.md` when the asset format is confirmed.

---

## Offline Behaviour (Planned)

- Scene list: cached in SQLite with a 24-hour TTL.
- Scene assets (360° photos, audio): optionally pre-downloaded by the user; no auto-download (file sizes
  are large). A «تحميل مسبق» button per scene will trigger background download via `expo-file-system`.
- Active viewing: works offline if the scene was pre-downloaded.

---

## RTL Behaviour (Planned)

- Scene list and annotation panels: standard RTL layout per ADR-0011.
- 360° viewer controls: gyroscope input is not direction-sensitive; no RTL consideration.
- Touch-drag navigation in the viewer: natural (drag direction matches visual direction); no mirroring.
- Audio narration: served as separate files per locale; the viewer picks `ar`, `ckb`, or `en` based on
  the current app locale.
