# AlterEcho - Real-Time Voice Transformation App

## Overview
AlterEcho is a real-time voice transformation mobile app with zero-latency client-side audio processing via Web Audio API (~6ms with 256-sample buffer). All DSP runs in the browser's audio thread — no network hops.

## Architecture
- **Frontend**: React Native (Expo SDK 54) with expo-router
- **Backend**: FastAPI (Python) - health check only
- **Audio Engine**: Web Audio API (ScriptProcessorNode, DynamicsCompressorNode, AnalyserNode)

## Features

### 10 Voice Profiles
| Profile | Effect | Echo | Compressor | Noise Gate |
|---------|--------|------|------------|------------|
| Radio Host | None | Off | On | On |
| Villain | Heavy (0.55x) | L2 | On | Off |
| Alien | Robotic (300Hz) | L1 | Off | Off |
| Underwater | Heavy (0.45x) | L3 | Off | Off |
| Megaphone | Robotic (400Hz) | Off | On | On |
| Whisper | None | L1 | Off | On |
| Stadium | None | L3 | On | Off |
| Telephone | Robotic (350Hz) | Off | On | On |
| Cave | None | L3 | Off | Off |
| Robot DJ | Robotic (150Hz) | Off | On | Off |

### Voice Effects (Mutually Exclusive)
- **Robotic**: Ring modulation (configurable carrier frequency)
- **Heavy**: Pitch shift down (configurable factor, default 0.65)
- **Chipmunk**: Pitch shift up (configurable factor, default 1.7)

### Echo (Separate Toggle, Combinable with Any Effect)
- Level 0: OFF
- Level 1: 100ms delay, 30% feedback
- Level 2: 250ms delay, 50% feedback
- Level 3: 500ms delay, 70% feedback

### Audio Enhancement
- Dynamic Range Compressor (threshold -24dB, ratio 12:1)
- Noise Gate (amplitude threshold 0.015)

### Device Selection
- Microphone dropdown: Enumerate all audio input devices (phone mic, Bluetooth, wired)
- Speaker dropdown: Enumerate all audio output devices (phone speaker, Bluetooth, wired)
- Hot-swap devices while audio is running (no interruption)
- Auto-detect device connect/disconnect events
- Supports routing one Bluetooth device mic → another Bluetooth device speaker

### Waveform Visualizer
- 32-bar frequency display from AnalyserNode
- ~30fps update rate

## Audio Processing Chain
```
Mic → InputGain → ScriptProcessor(NoiseGate → Effect → Echo) → Compressor → OutputGain → Analyser → Speakers
```

## File Structure
```
frontend/
  app/
    _layout.tsx              - Root layout
    index.tsx                - Main screen (all UI)
  src/
    hooks/useAudioEngine.ts  - Web Audio API engine
    constants/theme.ts       - Color palette
    constants/profiles.ts    - 10 voice profile presets
  eas.json                   - EAS Build config for APK
backend/
  server.py                  - FastAPI health check
```

## Testing
- All 48 tests passing (5 backend + 43 frontend)
- Test on web preview, phone browser, or build APK via EAS

## Planned: Crack Protection (Google Account Verification)
- Google Sign-In on app launch only (not during audio playback)
- Backend verifies purchase receipt from Play Store
- Once verified, audio runs with zero latency
- Re-verify on next app launch or every 24 hours
