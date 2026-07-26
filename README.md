# Silicon Workshop — PC Builder Game

A responsive browser game for assembling a custom gaming PC, checking compatibility, estimating power use, and comparing estimated game performance.

## Play locally

Download or clone the repository, then open `index.html` in a modern browser.

No build tools, package manager, account, or server are required for the built-in parts catalog.

## Features

- Desktop drag-and-drop installation
- iPhone and touchscreen tap-to-select placement
- CPU socket compatibility checking
- DDR memory compatibility checking
- Motherboard and case form-factor checking
- GPU and cooler clearance checking
- PSU capacity and headroom checking
- Live build price and estimated power draw
- Build progress and installed-parts list
- FPS estimates for several games, resolutions, and presets
- CPU/GPU bottleneck estimate
- Estimated CPU temperature and system noise
- Automatic local build saving with `localStorage`
- Optional remote JSON component catalogs
- Responsive layout for phones, tablets, and computers

## Controls

1. Select a component category.
2. Drag a component into its matching slot.
3. On touchscreen devices, tap the component and then tap its slot.
4. Tap an installed component in the Installed Parts list to remove it.
5. Complete the build and press **Run estimate**.

## Remote catalog format

The internet catalog loader accepts either a JSON array or an object with a `parts` array.

```json
{
  "parts": [
    {
      "id": "example-cpu",
      "type": "cpu",
      "name": "Example CPU",
      "brand": "Example",
      "price": 249,
      "power": 105,
      "score": 175,
      "socket": "AM5",
      "coolerNeed": 180,
      "spec": "8 cores • AM5"
    }
  ]
}
```

Valid `type` values:

- `cpu`
- `gpu`
- `motherboard`
- `ram`
- `case`
- `psu`
- `storage`
- `cooler`
- `fans`

The remote server must permit browser requests using CORS. Remote parts remain available until the page is refreshed; installed built-in parts are saved locally.

## Component fields

Common fields include `id`, `type`, `name`, `brand`, `price`, `power`, and `spec`.

Category-specific fields used by the compatibility and performance systems include:

- CPU: `score`, `socket`, `coolerNeed`
- GPU: `score`, `length`
- Motherboard: `socket`, `ramType`, `form`, `ramSlots`
- RAM: `ramType`, `capacity`, `score`
- Case: `forms`, `gpuMax`, `coolerMax`
- PSU: `wattage`
- Storage: `capacity`, `score`
- Cooler: `capacity`, `height`
- Fans: `count`, `cooling`

## Accuracy note

FPS, temperatures, noise, and power values are simplified game estimates intended for comparison. They are not measured hardware benchmarks and should not be used as purchasing guarantees.

## Project files

- `index.html` — interface and PC assembly workspace
- `style.css` — responsive visual design
- `app.js` — parts catalog, controls, compatibility logic, saving, and benchmark estimator
