// js/config.js — asset location toggle
//
// Choose where the heavy assets (chars/ + bg/) are loaded from.
// - Local (default): set USE_REMOTE_ASSETS = false  -> fetches ./chars/... ./bg/... relative to index.html
// - Remote: set USE_REMOTE_ASSETS = true and put your URL in REMOTE_ASSETS_URL
//
// Only chars/ and bg/ are redirected — data/*.json stays local so GitHub Pages
// can host index.html + js/ + data/ (a few MB)
// Set CORS allowing your Pages origin:
//   AllowedOrigins: ["https://<user>.github.io"]
//   AllowedMethods: ["GET","HEAD"]

export const USE_REMOTE_ASSETS = true;
export const REMOTE_ASSETS_URL = "https://pub-fc0f3c90b1b34cacb1ce80b771ca4b08.r2.dev/";
