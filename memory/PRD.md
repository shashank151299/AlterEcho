# AlterEcho - Real-Time Voice Transformation App

## Overview
AlterEcho is a real-time voice transformation mobile application that processes microphone audio through various DSP effects with zero-latency priority. All audio processing happens client-side using the Web Audio API for minimal round-trip time (~6ms with 256-sample buffer).

## Architecture
- **Frontend**: React Native (Expo SDK 54) with expo-router
- **Backend**: FastAPI (Python) - minimal, serves health check only
- **Audio Engine**: Web Audio API (ScriptProcessorNode, DynamicsCompressorNode, AnalyserNode)
- **Database**: MongoDB (for basic app state)

## Core Features

### Audio Processing (Client-Side, Zero Latency)
- **Robotic Effect**: Ring modulation using 200Hz sine wave carrier
- **Heavy Effect**: Pitch shift down (factor 0.65) via circular buffer resampling
- **Chipmunk Effect**: Pitch shift up (factor 1.7) via circular buffer resampling
- **Echo Effect**: Delay buffer with 4 levels (OFF, 100ms/30% feedback, 250ms/50%, 500ms/70%)
- **Noise Gate**: Amplitude threshold gate (0.015) to suppress background noise
- **Dynamic Range Compressor**: Web Audio DynamicsCompressorNode (threshold -24dB, ratio 12:1)

### UI/UX
- Enterprise Vibrant dark theme (#09090B background, #06B6D4 cyan accents)
- Real-time waveform visualizer (32-bar frequency display at ~30fps)
- High-elevation Input/Output cards with gain/volume sliders
- 2x2 effects grid with toggle behavior
- Echo level pill selector (0-3)
- Audio routing selector (Speaker/Headphones/Bluetooth)
- Master power on/off toggle

### Audio Chain
```
Mic → InputGain → ScriptProcessor (effects + noise gate) → DynamicsCompressor → OutputGain → Analyser → Speakers
```

## Technical Details
- Buffer size: 256 samples (~6ms at 44.1kHz)
- Sample rate: 44100 Hz
- Pitch buffer: 16384 samples for smooth shifting
- Echo buffer: 44100 samples (1 second max)
- Visualization: 30fps frequency data from AnalyserNode

## File Structure
```
frontend/
  app/
    _layout.tsx          - Root layout with dark StatusBar
    index.tsx            - Main AlterEcho screen (all UI components)
  src/
    hooks/
      useAudioEngine.ts  - Web Audio API engine (core DSP)
    constants/
      theme.ts           - Color palette constants
backend/
  server.py              - FastAPI health check
```

## No Authentication Required
This is a standalone utility app with no user accounts.

## Permissions
- Android: RECORD_AUDIO
- iOS: NSMicrophoneUsageDescription - "Transform your voice with real-time effects"
