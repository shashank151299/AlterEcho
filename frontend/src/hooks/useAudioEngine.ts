import { useState, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import { VoiceProfile } from '../constants/profiles';

export type EffectType = 'none' | 'robotic' | 'heavy' | 'chipmunk';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

const isWeb = Platform.OS === 'web';
const PITCH_BUF = 16384;
const ECHO_BUF = 44100;

// ── AudioWorklet processor code (runs on audio thread, NOT main thread) ──
const WORKLET_CODE = `
class AlterEchoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.eff = 'none';
    this.ng = false;
    this.echoOn = false;
    this.echoLvl = 0;
    this.freq = 200;
    this.pf = 1.0;
    this.cnt = 0;
    this.PB = 16384;
    this.EB = 44100;
    this.pb = new Float32Array(this.PB);
    this.pW = 0;
    this.pR = 0;
    this.eb = new Float32Array(this.EB);
    this.eW = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'params') {
        if (d.effect !== undefined) this.eff = d.effect;
        if (d.noiseGate !== undefined) this.ng = d.noiseGate;
        if (d.echoEnabled !== undefined) this.echoOn = d.echoEnabled;
        if (d.echoLevel !== undefined) this.echoLvl = d.echoLevel;
        if (d.carrierFreq !== undefined) this.freq = d.carrierFreq;
        if (d.pitchFactor !== undefined) this.pf = d.pitchFactor;
      }
      if (d.type === 'reset') {
        this.pb.fill(0); this.pW = 0; this.pR = 0;
        this.eb.fill(0); this.eW = 0; this.cnt = 0;
      }
    };
  }
  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0];
    const out = outputs[0] && outputs[0][0];
    if (!inp || !out) return true;
    const sr = sampleRate;
    for (let i = 0; i < inp.length; i++) {
      let s = inp[i];
      if (this.ng && Math.abs(s) < 0.015) s = 0;
      switch (this.eff) {
        case 'robotic': {
          s *= Math.sin(6.283185 * this.freq * ((this.cnt + i) / sr));
          break;
        }
        case 'heavy':
        case 'chipmunk': {
          this.pb[this.pW] = inp[i];
          this.pW = (this.pW + 1) % this.PB;
          const ri = Math.floor(this.pR);
          const fr = this.pR - ri;
          s = this.pb[ri % this.PB] * (1 - fr) + this.pb[(ri + 1) % this.PB] * fr;
          this.pR = (this.pR + this.pf) % this.PB;
          const dist = (this.pW - this.pR + this.PB) % this.PB;
          if (dist < 256 || dist > this.PB - 256) {
            this.pR = (this.pW - this.PB / 2 + this.PB) % this.PB;
          }
          break;
        }
      }
      if (this.echoOn && this.echoLvl > 0) {
        const ms = [0, 100, 250, 500][this.echoLvl];
        const fb = [0, 0.3, 0.5, 0.7][this.echoLvl];
        const ds = Math.floor((ms / 1000) * sr);
        const rp = (this.eW - ds + this.EB) % this.EB;
        s += this.eb[rp] * fb;
      }
      if (this.echoOn) {
        this.eb[this.eW] = s;
        this.eW = (this.eW + 1) % this.EB;
      }
      out[i] = s;
    }
    this.cnt += inp.length;
    return true;
  }
}
registerProcessor('alter-echo-processor', AlterEchoProcessor);
`;

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
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

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
  const workletRef = useRef<any>(null);
  const usingWorklet = useRef(false);

  // DSP state ref (fallback for ScriptProcessorNode)
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

  // ── Unified DSP param update (both worklet + fallback ref) ──
  const updateDSP = (params: Record<string, any>) => {
    Object.entries(params).forEach(([k, v]) => {
      (dsp.current as any)[k] = v;
    });
    if (workletRef.current) {
      workletRef.current.port.postMessage({ type: 'params', ...params });
    }
  };

  const resetDSPBuffers = () => {
    dsp.current.pitchBuf.fill(0);
    dsp.current.pW = 0;
    dsp.current.pR = 0;
    dsp.current.echoBuf.fill(0);
    dsp.current.eW = 0;
    dsp.current.counter = 0;
    if (workletRef.current) {
      workletRef.current.port.postMessage({ type: 'reset' });
    }
  };

  // Sync state → DSP
  useEffect(() => { updateDSP({ effect }); }, [effect]);
  useEffect(() => { updateDSP({ echoEnabled }); }, [echoEnabled]);
  useEffect(() => { updateDSP({ echoLevel }); }, [echoLevel]);
  useEffect(() => { updateDSP({ noiseGate }); }, [noiseGate]);
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
  const refreshDevices = async (): Promise<{ inputs: AudioDevice[]; outputs: AudioDevice[] } | null> => {
    if (!isWeb) return null;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }));
      const outputs = devices
        .filter((d) => d.kind === 'audiooutput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${i + 1}`,
        }));
      setInputDevices(inputs);
      setOutputDevices(outputs);
      return { inputs, outputs };
    } catch {
      return null;
    }
  };

  // Auto-select first device
  useEffect(() => {
    if (inputDevices.length > 0 && !selectedInput) setSelectedInputState(inputDevices[0].deviceId);
  }, [inputDevices, selectedInput]);
  useEffect(() => {
    if (outputDevices.length > 0 && !selectedOutput) setSelectedOutputState(outputDevices[0].deviceId);
  }, [outputDevices, selectedOutput]);

  // Enumerate on mount + listen for device changes (Bluetooth connect/disconnect)
  useEffect(() => {
    if (!isWeb) return;
    refreshDevices();
    const handler = () => refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ── Device hot-swap ──
  const switchInput = async (deviceId: string) => {
    setSelectedInputState(deviceId);
    setActiveProfile(null);
    if (!isActive || !ctxRef.current || !inputGainRef.current) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          echoCancellation: false,
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
      setError('Failed to switch microphone: ' + (err?.message || ''));
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
      // Request MINIMUM latency — no sample rate conversion overhead
      const ctx = new Ctx({ latencyHint: 0 });
      ctxRef.current = ctx;

      // Set output device FIRST
      if (selectedOutput && typeof ctx.setSinkId === 'function') {
        try { await ctx.setSinkId(selectedOutput); } catch {}
      }

      // Get mic — CRITICAL: echoCancellation OFF removes 20-50ms of browser AEC delay
      const audioConstraints: any = {
        echoCancellation: false,
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

      // ── Try AudioWorklet (audio thread, 128 samples = ~2.7ms) ──
      let processingNode: any;
      try {
        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        processingNode = new AudioWorkletNode(ctx, 'alter-echo-processor');
        workletRef.current = processingNode;
        usingWorklet.current = true;
        // Send current state to worklet
        processingNode.port.postMessage({
          type: 'params',
          effect: dsp.current.effect,
          noiseGate: dsp.current.noiseGate,
          echoEnabled: dsp.current.echoEnabled,
          echoLevel: dsp.current.echoLevel,
          carrierFreq: dsp.current.carrierFreq,
          pitchFactor: dsp.current.pitchFactor,
        });
      } catch {
        // ── Fallback: ScriptProcessorNode (main thread, 256 samples) ──
        processingNode = ctx.createScriptProcessor(256, 1, 1);
        processingNode.onaudioprocess = (e: any) => {
          const inp = e.inputBuffer.getChannelData(0);
          const out = e.outputBuffer.getChannelData(0);
          const d = dsp.current;
          const sr = ctx.sampleRate;
          for (let i = 0; i < inp.length; i++) {
            let s = inp[i];
            if (d.noiseGate && Math.abs(s) < 0.015) s = 0;
            switch (d.effect) {
              case 'robotic': {
                s *= Math.sin(6.283185 * d.carrierFreq * ((d.counter + i) / sr));
                break;
              }
              case 'heavy':
              case 'chipmunk': {
                d.pitchBuf[d.pW] = inp[i];
                d.pW = (d.pW + 1) % PITCH_BUF;
                const ri = Math.floor(d.pR);
                const fr = d.pR - ri;
                s = d.pitchBuf[ri % PITCH_BUF] * (1 - fr) + d.pitchBuf[(ri + 1) % PITCH_BUF] * fr;
                d.pR = (d.pR + d.pitchFactor) % PITCH_BUF;
                const dist = (d.pW - d.pR + PITCH_BUF) % PITCH_BUF;
                if (dist < 512 || dist > PITCH_BUF - 512) {
                  d.pR = (d.pW - PITCH_BUF / 2 + PITCH_BUF) % PITCH_BUF;
                }
                break;
              }
            }
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
        usingWorklet.current = false;
      }

      // Compressor (bypass-able: ratio=1 when off)
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
      ig.connect(processingNode);
      processingNode.connect(comp);
      comp.connect(og);
      og.connect(an);
      an.connect(ctx.destination);

      // Measure actual latency
      const base = ctx.baseLatency || 0;
      const output = ctx.outputLatency || 0;
      setLatencyMs(Math.round((base + output) * 1000));

      setIsActive(true);

      // Re-enumerate devices with labels (now that permission is granted)
      setTimeout(async () => {
        const result = await refreshDevices();
        if (result) {
          // Auto-select the device that's actually being used
          const activeTrack = stream.getAudioTracks()[0];
          const settings = activeTrack?.getSettings?.();
          if (settings?.deviceId) {
            setSelectedInputState(settings.deviceId);
          }
        }
      }, 300);

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
    workletRef.current = null;
    usingWorklet.current = false;
    resetDSPBuffers();
    setWaveformData(new Array(32).fill(0));
    setLatencyMs(null);
    setIsActive(false);
  };

  // ── Effect controls ──
  const setEffect = (e: EffectType) => {
    resetDSPBuffers();
    if (e === 'robotic') updateDSP({ carrierFreq: 200 });
    if (e === 'heavy') updateDSP({ pitchFactor: 0.65 });
    if (e === 'chipmunk') updateDSP({ pitchFactor: 1.7 });
    updateDSP({ effect: e });
    setEffectState(e);
    setActiveProfile(null);
  };

  const toggleEcho = () => {
    const next = !echoEnabled;
    if (next) {
      dsp.current.echoBuf.fill(0);
      dsp.current.eW = 0;
      if (workletRef.current) workletRef.current.port.postMessage({ type: 'reset' });
    }
    updateDSP({ echoEnabled: next });
    setEchoEnabledState(next);
    setActiveProfile(null);
  };

  const setEchoLevel = (level: number) => {
    updateDSP({ echoLevel: level });
    setEchoLevelState(level);
    setActiveProfile(null);
  };

  // ── Profile application ──
  const applyProfile = (profile: VoiceProfile) => {
    resetDSPBuffers();
    updateDSP({
      effect: profile.effect,
      carrierFreq: profile.carrierFreq,
      pitchFactor: profile.pitchFactor,
      echoEnabled: profile.echoEnabled,
      echoLevel: profile.echoLevel,
      noiseGate: profile.noiseGate,
    });
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
    latencyMs,
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
    refreshDevices,
  };
}
