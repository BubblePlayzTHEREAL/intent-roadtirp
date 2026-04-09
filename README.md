# 🚗 Internet Road Trip (Private Edition)

A **private, self-hosted** recreation of [neal.fun/internet-roadtrip](https://neal.fun/internet-roadtrip/).  
Takes you on an automatic virtual road trip anywhere in the world using **Google Street View**.

## ✨ Features

| Feature | Details |
|---|---|
| 🌍 Auto-drive | Follows Street View navigation links continuously |
| 📍 Location names | Reverse-geocoded country, region & city |
| 🗺 Mini-map | Dark-themed map showing your route in real time |
| ⏸ Pause / Resume | Full control over the trip |
| 🚀 Speed control | 5 speed steps (6 s → 0.8 s between hops) |
| 🗺 New Trip | Teleport to a random road anywhere on Earth |
| ⚙️ Settings | Change your API key at any time |
| 🔒 Private | Your API key is stored only in your browser's `localStorage` |

## 🚀 Quick Start

### 1 — Get a Google Maps API Key

1. Go to [console.cloud.google.com](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable these three APIs:
   - **Maps JavaScript API**
   - **Street View Static API**
   - **Geocoding API**
4. Create an API key under **Credentials**.
5. *(Recommended)* Restrict the key to your own domain.

### 2 — Run the app

#### Option A — Open directly in a browser (simplest)

```bash
# Clone the repo
git clone https://github.com/BubblePlayzTHEREAL/intent-roadtirp.git
cd intent-roadtirp

# Open index.html in your browser
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

> **Note:** The Google Maps API requires the page to be served over HTTP/HTTPS, not `file://`.
> Use Option B or C if you see a blank map.

#### Option B — Simple local server (Python)

```bash
python3 -m http.server 8080
# Then open http://localhost:8080
```

#### Option C — Simple local server (Node.js / npx)

```bash
npx serve .
# Then open the URL shown in the terminal
```

### 3 — Enter your API key

On first load you'll see a setup screen. Paste your API key and click **Start Trip 🛣️**.  
Your key is saved to `localStorage` and never leaves your browser.

## 📁 Project Structure

```
intent-roadtirp/
├── index.html   # App shell & layout
├── style.css    # Dark cinematic theme
├── app.js       # Auto-drive logic, geocoding, mini-map
└── README.md    # This file
```

## 🌐 Supported Starting Locations

The app chooses randomly from 26 curated roads spread across every continent:

- 🇺🇸 Route 66, Pacific Coast Highway, Going-to-the-Sun Road, Blue Ridge Parkway, Denali Highway
- 🇨🇦 Icefields Parkway
- 🇨🇱 Carretera Austral  
- 🇦🇷 Ruta 40
- 🇧🇷 Amazon Basin  
- 🇮🇹 Amalfi Coast  
- 🇳🇴 Atlantic Road, Trollstigen  
- 🇫🇷 Col du Galibier  
- 🇮🇸 Ring Road  
- 🇦🇹 Grossglockner  
- 🇷🇴 Transfăgărășan  
- 🇮🇪 Connemara, N59  
- 🇿🇦 Cape Peninsula  
- 🇲🇦 Atlas Mountains  
- 🇹🇿 Ngorongoro  
- 🇵🇰 Karakoram Highway  
- 🇮🇳 Manali–Leh Highway  
- 🇨🇭 Furkapass  
- 🇯🇵 Hokkaido  
- 🇦🇺 Great Ocean Road  
- 🇳🇿 Milford Road  

## ⚠️ API Usage & Costs

Each visit to a Street View panorama and each geocoding lookup counts against your Google Maps quota.

| API | Free tier (monthly) |
|---|---|
| Street View Static API | $200 credit ≈ ~28,000 panoramas |
| Geocoding API | $200 credit ≈ ~40,000 lookups |

The app throttles geocoding to **1 call per 3 hops** to reduce usage.  
Set up **budget alerts** in Google Cloud Console to avoid surprise bills.

## 📜 License

MIT — do whatever you want with it.
