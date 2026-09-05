# ✟ HOLY POKER

A Balatro-style 3D pixel-art roguelike poker game. Every card has an ability,
every card levels up forever — losing a run never loses your progress.
Arise again.

## Modules

`js/chapel.js` is the Chapel of Chance (Jacks-or-Better video poker) minigame; it
borrows the scene's deal/hold/discard primitives and relabels selection badges via
`HP.scene.setBadgeLabel`. Cosmetics live in `cardart.js` (`STYLES`, `TABLES`).

## Website

`site/` is a static promo site (home / download / phone-play pages), served at
`/site/` by server.js. Download links point at `dist/`. The folder is host-agnostic —
drop it (plus the game files + dist) on any static host and everything works.

## Play (dev)

```
node server.js
```

then open http://localhost:8437 — or just open `index.html` in a browser.

## Desktop app

```
npm install
npm run dist
```

Outputs to `dist/`:

- `HolyPoker-Setup-<version>.exe` — Windows installer (Start Menu + desktop shortcut)
- `HolyPoker-Portable-<version>.exe` — single portable exe, no install needed

Both are unsigned, so Windows SmartScreen will warn on first run:
**More info → Run anyway.**

Run in a window from source with `npm start`. F11 toggles fullscreen.

## Where saves live

- Browser: `localStorage`
- Desktop app: per-user app data (`%APPDATA%/Holy Poker`) — survives updates

## Tech

No build step, no game asset files: plain JS + Three.js (vendored), all card art,
UI chrome, and audio generated procedurally at boot.
