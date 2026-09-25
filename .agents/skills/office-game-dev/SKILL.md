---
name: office-game-dev
description: Development, verification, and asset generation runbook for the 'Не пались' (office_game) pixel-art browser game. Use when modifying game.js, adding sprites, adjusting balance, or running QA for the office game.
---

# 'Не пались' (office_game) Development & QA Runbook

This skill defines the technical workflow and quality standards for developing the **"Не пались"** pixel-art office game.

---

## 1. Core Architecture Principles
- **Zero-Build Static Web**: The game must run directly in the browser by opening `index.html`. No build tools, bundlers, or server-side dependencies.
- **Canvas Rendering**: 960x540 game units rendered at 2x (1920x1080). Office is procedural (`js/art.js`), geometry in `js/world.js`, lines in `js/lines.js`, loop/AI in `game.js`.
- **Audio**: Procedurally generated via the Web Audio API without external audio file dependencies.

---

## 2. Input & Controls Standard (Dual Layout)
Every action must support both physical key codes and keyboard character fallbacks:
- **Movement**: `WASD` / `KeyW, KeyA, KeyS, KeyD` and Cyrillic `ЦФЫВ`.
- **Work / Action**: `E` / `KeyE` and Cyrillic `У`.
- **Hide**: `H` / `KeyH` and Cyrillic `Р`.
- **Pause**: `P` / `KeyP` and Cyrillic `З` (also `Esc`).
- **Phone**: `Tab` / `Q` / `KeyQ` and Cyrillic `Й`. **Mute**: `M` / Cyrillic `Ь`.
- **Arrows & Enter**: Standard navigation and modal acceptance.

---

## 3. Verification Protocol
After making any code changes to `game.js` or styles:
1. **Syntax Verification**:
   ```bash
   for f in game.js js/*.js; do node --check "$f"; done
   ```
   Then run the automated browser suite: `node scripts/qa.js` (all checks must pass; review screenshots in `.qa/`).
2. **Keyboard Handler Check**: Verify both English and Russian layout keys map to the correct game intents.
3. **Visual / Canvas Inspection**: Ensure sprite scaling, HUD positioning, and occlusion layers align with the background map.
4. **Documentation Sync**: Update `CHANGELOG.md`, `VERSION.md`, and corresponding documents in `docs/` (`GAMEPLAY.md`, `ART_DIRECTION.md`).

---

## 4. Sprite & Asset Creation Workflow (Nano Banana / Imagen)
When adding new character sprites, furniture, or items:
1. **Generate with `generate_image`**:
   - Prompt: `Clean 2D pixel art sprite of [coworker / office prop], 32x32 resolution scale, crisp square pixels, strictly no blur, no anti-aliasing, retro color palette (Pico-8 / Endesga 32 style), solid dark outline, isolated on single-color background.`
2. **Process with `pixel_processor.py`**:
   ```powershell
   python scripts/pixel_processor.py assets/new_sprite_raw.png -o assets/new_sprite.png -s 32
   ```
3. **Record in `docs/ART_DIRECTION.md`**: Note the asset dimensions, visual style, and date created.
