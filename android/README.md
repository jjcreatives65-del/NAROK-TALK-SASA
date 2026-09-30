# Narok Talk Sasa - Android Mobile Application

Dedicated Android native mobile wrapper powered by Capacitor (`ke.co.naroktalksasa.app`), bringing the full Grassroots Outreach CRM, Omnichannel Campaign Studio, and Rally Mobilization tools directly to field organizers and campaign managers on Android smartphones and tablets.

---

## 📱 Application Profile

- **App Name**: Talk Sasa
- **Package ID**: `ke.co.naroktalksasa.app`
- **Framework**: Capacitor 8.x + Native Android (Java / Gradle)
- **Minimum SDK**: 23 (Android 6.0 Marshmallow)
- **Target SDK**: 35 (Android 15)
- **Permissions**: `INTERNET`, `CAMERA`, `READ_EXTERNAL_STORAGE` (for poster uploads and photo changes)
- **Network Security**: Configured in `res/xml/network_security_config.xml` to allow cleartext HTTP during local development (`10.0.2.2`, LAN IPs) and enforcing strict HTTPS in production.

---

## 🛠️ Project Structure

```
android/
├── app/
│   ├── build.gradle                   # Module build configuration
│   ├── src/main/
│   │   ├── AndroidManifest.xml        # App permissions, activities, network policy
│   │   ├── java/ke/co/naroktalksasa/app/MainActivity.java
│   │   ├── res/                       # Icons, splash screens, XML configurations
│   │   │   └── xml/network_security_config.xml
│   │   └── assets/public/             # Synced web application bundle
├── build.gradle                       # Top-level Gradle configuration
├── gradlew & gradlew.bat              # Gradle wrapper scripts
├── package.json                       # Mobile build & sync scripts
└── README.md                          # This manual
```

---

## 🔄 Syncing Changes from `frontend/`

Whenever you update HTML, CSS, or JS in `frontend/`, copy the latest assets into the Android native build:

From the project root:
```bash
# Windows
npm run sync:android

# Or using Capacitor directly
cmd /c npx cap copy android
```

---

## 🚀 Building & Running the Android App

### Method 1: Using Android Studio (Recommended)
1. Open **Android Studio**.
2. Select **"Open an Existing Project"** and browse to the `android/` directory.
3. Allow Gradle to sync dependencies (first time takes ~1-2 minutes).
4. Connect an Android phone via USB (with **USB Debugging enabled**) or start an Android Emulator.
5. Click the green **Run (▶)** button or press `Shift + F10`.

---

### Method 2: Building Debug APK from Command Line
You can compile a standalone `.apk` directly without launching Android Studio:

```bash
cd android

# On Windows
gradlew.bat assembleDebug

# On Linux / macOS
./gradlew assembleDebug
```

The resulting debug APK will be generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

Transfer this file to any Android device to install and test immediately!

---

### Method 3: Building Production Signed Release APK / AAB
For distribution or Google Play Store publishing:

1. Generate a keystore (if you don't already have one):
   ```bash
   keytool -genkey -v -keystore talksasa-release-key.jks -alias talksasa -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Build the release bundle:
   ```bash
   cd android
   gradlew.bat bundleRelease
   ```
   Or build a release APK:
   ```bash
   gradlew.bat assembleRelease
   ```
3. Sign the APK using `apksigner` or configure your signing config in `android/app/build.gradle`.

---

## 📡 Connecting the Mobile App to Your Backend Server

When running on an Android device or emulator:
1. **In the Android Emulator**:
   - `http://10.0.2.2:3000` automatically connects to `localhost:3000` on your host computer.
2. **On a Physical Android Device connected to Wi-Fi**:
   - Make sure your phone and development computer are on the same Wi-Fi network.
   - Find your PC's local IP address (e.g. `ipconfig` -> `192.168.1.120`).
   - Launch the app, tap the **"API Server"** button in the header, and set the URL to:
     `http://192.168.1.120:3000`
   - Tap **"Save & Apply"**.
3. **In Production**:
   - Enter your deployed cloud API URL (e.g. `https://api.talksasa.ke` or your Railway/Render URL).
