import { useState, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import { VoiceProfile } from '../constants/profiles';

export type EffectType = 'none' | 'robotic' | 'heavy' | 'chipmunk';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

const isWeb = Platform.OS === 'web';
const BUFFER_SIZE = 256;
const PITCH_BUF = 16384;
const ECHO_BUF = 44100;

export function useAudioEngine() {
  const [isActive, setIsActive] = useState(false);
  const [effect, setEffectState] = useState<EffectType>('none');
  const [echoEnabled, setEchoEnabledState] = useState(false);
  const [echoLevel, setEchoLevelState] = useState(0);
  const [gain, setGainState] = useState(80);
  const [volume, setVolumeState] = useState(80);
  const [compressor, setCompressorState] = useState(false);
  const [noiseGate, setNoiseGateState] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(32).fill(0));
  const [error, setError] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);

  // Device state
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInput, setSelectedInputState] = useState('');
  const [selectedOutput, setSelectedOutputState] = useState('');

  // Web Audio refs
  const ctxRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const sourceRef = useRef<any>(null);
  const inputGainRef = useRef<any>(null);
  const compressorRef = useRef<any>(null);
  const outputGainRef = useRef<any>(null);
  const analyserRef = useRef<any>(null);
  const animRef = useRef(0);

  // DSP state ref (used inside audio callback, no React re-renders)
  const dsp = useRef({
    effect: 'none' as EffectType,
    echoEnabled: false,
    echoLevel: 0,
    noiseGate: false,
    counter: 0,
    carrierFreq: 200,
    pitchFactor: 1.0,
    pitchBuf: new Float32Array(PITCH_BUF),
    pW: 0,
    pR: 0,
    echoBuf: new Float32Array(ECHO_BUF),
    eW: 0,
  });

  // Sync React state → DSP ref
  useEffect(() => { dsp.current.effect = effect; }, [effect]);
  useEffect(() => { dsp.current.echoEnabled = echoEnabled; }, [echoEnabled]);
  useEffect(() => { dsp.current.echoLevel = echoLevel; }, [echoLevel]);
  useEffect(() => { dsp.current.noiseGate = noiseGate; }, [noiseGate]);
  useEffect(() => {
    if (inputGainRef.current) inputGainRef.current.gain.value = gain / 100;
  }, [gain]);
  useEffect(() => {
    if (outputGainRef.current) outputGainRef.current.gain.value = volume / 100;
  }, [volume]);
  useEffect(() => {
    if (compressorRef.current) {
      compressorRef.current.threshold.value = compressor ? -24 : 0;
      compressorRef.current.ratio.value = compressor ? 12 : 1;
    }
  }, [compressor]);

  // ── Device enumeration ──
  const refreshDevices = async () => {
    if (!isWeb) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(
        devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${i + 1}`,
          }))
      );
      setOutputDevices(
        devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${i + 1}`,
          }))
      );
    } catch {}
  };

  // Auto-select first device when devices list changes
  useEffect(() => {
    if (inputDevices.length > 0 && !selectedInput) {
      setSelectedInputState(inputDevices[0].deviceId);
    }
  }, [inputDevices, selectedInput]);

  useEffect(() => {
    if (outputDevices.length > 0 && !selectedOutput) {
      setSelectedOutputState(outputDevices[0].deviceId);
    }
  }, [outputDevices, selectedOutput]);

  // Enumerate on mount + listen for device changes
  useEffect(() => {
    if (!isWeb) return;
    refreshDevices();
    const handler = () => refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ── Device switching (hot-swap while engine is running) ──
  const switchInput = async (deviceId: string) => {
    setSelectedInputState(deviceId);
    setActiveProfile(null);
    if (!isActive || !ctxRef.current || !inputGainRef.current) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const newSource = ctxRef.current.createMediaStreamSource(newStream);
      newSource.connect(inputGainRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (streamRef.current) streamRef.current.getTracks().forEach((t: any) => t.stop());
      sourceRef.current = newSource;
      streamRef.current = newStream;
    } catch (err: any) {
      setError('Failed to switch microphone');
    }
  };

  const switchOutput = async (deviceId: string) => {
    setSelectedOutputState(deviceId);
    setActiveProfile(null);
    if (!ctxRef.current) return;
    try {
      if (typeof ctxRef.current.setSinkId === 'function') {
        await ctxRef.current.setSinkId(deviceId);
      }
    } catch {}
  };

  // ── Start engine ──
  const start = async () => {
    if (!isWeb) {
      setError('Real-time audio requires web preview');
      return;
    }
    try {
      setError(null);
      const W = window as any;
      const Ctx = W.AudioContext || W.webkitAudioContext;
      const ctx = new Ctx({ latencyHint: 'interactive', sampleRate: 44100 });
      ctxRef.current = ctx;

      // Set output device before getting mic
      if (selectedOutput && typeof ctx.setSinkId === 'function') {
        try { await ctx.setSinkId(selectedOutput); } catch {}
      }

      const audioConstraints: any = {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      };
      if (selectedInput) {
        audioConstraints.deviceId = { exact: selectedInput };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;

      const src = ctx.createMediaStreamSource(stream);
      sourceRef.current = src;

      const ig = ctx.createGain();
      ig.gain.value = gain / 100;
      inputGainRef.current = ig;

      // ── ScriptProcessor: all DSP here for zero extra latency ──
      const proc = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      proc.onaudioprocess = (e: any) => {
        const inp = e.inputBuffer.getChannelData(0);
        const out = e.outputBuffer.getChannelData(0);
        const d = dsp.current;
        const sr = ctx.sampleRate;

        for (let i = 0; i < inp.length; i++) {
          let s = inp[i];

          // Noise gate
          if (d.noiseGate && Math.abs(s) < 0.015) s = 0;

          // Main effect
          switch (d.effect) {
            case 'robotic': {
              const t = (d.counter + i) / sr;
              s *= Math.sin(2 * Math.PI * d.carrierFreq * t);
              break;
            }
            case 'heavy':
            case 'chipmunk': {
              const factor = d.pitchFactor;
              d.pitchBuf[d.pW] = inp[i];
              d.pW = (d.pW + 1) % PITCH_BUF;
              const ri = Math.floor(d.pR);
              const fr = d.pR - ri;
              s = d.pitchBuf[ri % PITCH_BUF] * (1 - fr) + d.pitchBuf[(ri + 1) % PITCH_BUF] * fr;
              d.pR = (d.pR + factor) % PITCH_BUF;
              const dist = (d.pW - d.pR + PITCH_BUF) % PITCH_BUF;
              if (dist < BUFFER_SIZE * 2 || dist > PITCH_BUF - BUFFER_SIZE * 2) {
                d.pR = (d.pW - PITCH_BUF / 2 + PITCH_BUF) % PITCH_BUF;
              }
              break;
            }
          }

          // Echo (separate layer, works with any effect)
          if (d.echoEnabled && d.echoLevel > 0) {
            const ms = [0, 100, 250, 500][d.echoLevel];
            const fb = [0, 0.3, 0.5, 0.7][d.echoLevel];
            const ds = Math.floor((ms / 1000) * sr);
            const rp = (d.eW - ds + ECHO_BUF) % ECHO_BUF;
            s += d.echoBuf[rp] * fb;
          }
          if (d.echoEnabled) {
            d.echoBuf[d.eW] = s;
            d.eW = (d.eW + 1) % ECHO_BUF;
          }

          out[i] = s;
        }
        d.counter += inp.length;
      };

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = compressor ? -24 : 0;
      comp.knee.value = 30;
      comp.ratio.value = compressor ? 12 : 1;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      compressorRef.current = comp;

      const og = ctx.createGain();
      og.gain.value = volume / 100;
      outputGainRef.current = og;

      const an = ctx.createAnalyser();
      an.fftSize = 64;
      an.smoothingTimeConstant = 0.75;
      analyserRef.current = an;

      // Chain: source → gain → processor → compressor → output → analyser → speakers
      src.connect(ig);
      ig.connect(proc);
      proc.connect(comp);
      comp.connect(og);
      og.connect(an);
      an.connect(ctx.destination);

      setIsActive(true);

      // Refresh devices after permission granted (now we get labels)
      refreshDevices();

      // Visualization loop (~30fps)
      let fc = 0;
      const vizLoop = () => {
        fc++;
        if (fc % 2 === 0 && analyserRef.current) {
          const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(buf);
          setWaveformData(Array.from(buf.slice(0, 32)));
        }
        animRef.current = requestAnimationFrame(vizLoop);
      };
      vizLoop();
    } catch (err: any) {
      console.error('Audio engine error:', err);
      setError(err?.message || 'Failed to start audio engine');
    }
  };

  // ── Stop engine ──
  const stop = () => {
    cancelAnimationFrame(animRef.current);
    if (sourceRef.current) sourceRef.current.disconnect();
    if (streamRef.current) streamRef.current.getTracks().forEach((t: any) => t.stop());
    if (ctxRef.current) ctxRef.current.close();
    ctxRef.current = null;
    streamRef.current = null;
    sourceRef.current = null;
    inputGainRef.current = null;
    compressorRef.current = null;
    outputGainRef.current = null;
    analyserRef.current = null;
    dsp.current.pitchBuf.fill(0);
    dsp.current.echoBuf.fill(0);
    dsp.current.pW = 0;
    dsp.current.pR = 0;
    dsp.current.eW = 0;
    dsp.current.counter = 0;
    setWaveformData(new Array(32).fill(0));
    setIsActive(false);
  };

  // ── Effect controls ──
  const setEffect = (e: EffectType) => {
    dsp.current.pitchBuf.fill(0);
    dsp.current.pW = 0;
    dsp.current.pR = 0;
    // Reset to defaults for manual buttons
    if (e === 'robotic') dsp.current.carrierFreq = 200;
    if (e === 'heavy') dsp.current.pitchFactor = 0.65;
    if (e === 'chipmunk') dsp.current.pitchFactor = 1.7;
    dsp.current.effect = e;
    setEffectState(e);
    setActiveProfile(null);
  };

  const toggleEcho = () => {
    const next = !echoEnabled;
    if (next) {
      dsp.current.echoBuf.fill(0);
      dsp.current.eW = 0;
    }
    dsp.current.echoEnabled = next;
    setEchoEnabledState(next);
    setActiveProfile(null);
  };

  const setEchoLevel = (level: number) => {
    dsp.current.echoLevel = level;
    setEchoLevelState(level);
    setActiveProfile(null);
  };

  // ── Profile application ──
  const applyProfile = (profile: VoiceProfile) => {
    // Reset buffers
    dsp.current.pitchBuf.fill(0);
    dsp.current.pW = 0;
    dsp.current.pR = 0;
    dsp.current.echoBuf.fill(0);
    dsp.current.eW = 0;

    // Set DSP params directly
    dsp.current.effect = profile.effect;
    dsp.current.carrierFreq = profile.carrierFreq;
    dsp.current.pitchFactor = profile.pitchFactor;
    dsp.current.echoEnabled = profile.echoEnabled;
    dsp.current.echoLevel = profile.echoLevel;
    dsp.current.noiseGate = profile.noiseGate;

    // Set React state
    setEffectState(profile.effect);
    setEchoEnabledState(profile.echoEnabled);
    setEchoLevelState(profile.echoLevel);
    setGainState(profile.gain);
    setVolumeState(profile.volume);
    setCompressorState(profile.compressor);
    setNoiseGateState(profile.noiseGate);
    setActiveProfile(profile.id);
  };

  return {
    isActive,
    effect,
    echoEnabled,
    echoLevel,
    gain,
    volume,
    compressor,
    noiseGate,
    waveformData,
    error,
    isWeb,
    activeProfile,
    inputDevices,
    outputDevices,
    selectedInput,
    selectedOutput,
    toggle: () => (isActive ? stop() : start()),
    setEffect,
    toggleEcho,
    setEchoLevel,
    setGain: (v: number) => { setGainState(v); setActiveProfile(null); },
    setVolume: (v: number) => { setVolumeState(v); setActiveProfile(null); },
    toggleCompressor: () => { setCompressorState((p) => !p); setActiveProfile(null); },
    toggleNoiseGate: () => { setNoiseGateState((p) => !p); setActiveProfile(null); },
    switchInput,
    switchOutput,
    applyProfile,
  };
}
