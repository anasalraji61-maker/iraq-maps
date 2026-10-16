# @iraq-maps/feature-tour3d

Virtual 3D walkthroughs of Iraqi heritage sites and landmarks. This feature is **reserved for a later phase**
— only contracts and stubs exist. Do not implement screens until the tour3d milestone is active.

---

## What This Package Will Do (planned)

- Browse a list of 3D scenes: heritage sites, mosques, markets, parks, museums.
- Open a scene and navigate between viewpoints using a 360° photo/video viewer or a 3D model renderer.
- View annotations at each viewpoint: info panels, linked places, food spots, historic notes.
- Save scenes to the activity/bookmarks list.

---

## Current State

This package currently contains:

- `package.json` — workspace package definition
- `src/index.ts` — empty exports (placeholder)
- `README.md` — this file

The contracts are defined and frozen in `packages/contracts/src/tour3d.ts`. Implement against those types
when the milestone opens.

---

## Planned Screens

| Export              | Route                    | Description                                       |
|---------------------|--------------------------|---------------------------------------------------|
| `Tour3DListScreen`  | `/tour3d`                | Browse scenes by city and category                |
| `Tour3DSceneScreen` | `/tour3d/[id]`           | Immersive scene viewer with annotation overlays   |

---

## Ports to Consume

| Port               | Package                | Used for                                 |
|--------------------|------------------------|------------------------------------------|
| `tour3dContract`   | `@iraq-maps/contracts` | List scenes, get scene details           |
| `mediaContract`    | `@iraq-maps/contracts` | Signed URLs for 360° photo/video assets  |
| `placesContract`   | `@iraq-maps/contracts` | Resolve linked place IDs in annotations  |

---

## i18n Namespaces

Namespace: `feature-tour3d`

Will use:
- `ar.json` — Arabic
- `ckb.json` — Kurdish Sorani
- `en.json` — English

Key groups: `scene.*`, `category.*`, `annotation.*`, `viewer.*`

---

## Dependencies (planned)

The 3D viewer will likely need one of:

- `react-native-panorama-view` — for 360° photo panoramas
- `expo-three` + `three.js` — for 3D model rendering
- A custom WebView wrapper with `three.js` if native bindings prove insufficient

These are not yet added to `package.json`. The choice should be recorded in an ADR when the milestone opens.
