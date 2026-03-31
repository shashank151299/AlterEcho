import { useState, useRef, useEffect } from 'react';
import { Platform } from 'react-native';

export type EffectType = 'none' | 'robotic' | 'heavy' | 'chipmunk' | 'echo';
export type RouteType = 'speaker' | 'headphones' | 'bluetooth';

const isWeb = Platform.OS === 'web';
const BUFFER_SIZE = 256;
const PITCH_BUF = 16384;
const ECHO_BUF = 44100;

export function useAudioEngine() {
  const [isActive, setIsActive] = useState(false);
  const [effect, setEffectState] = useState<EffectType>('none');
  const [echoLevel, setEchoLevelState] = useState(0);
  const [gain, setGainState] = useState(80);
  const [volume, setVolumeState] = useState(80);
  const [compressor, setCompressorState] = useState(false);
  const [noiseGate, setNoiseGateState] = useState(false);
  const [routing, setRoutingState] = useState<RouteType>('speaker');
  const [waveformData, setWaveformData] = useState<number[]>(new Array(32).fill(0));
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const inputGainRef = useRef<any>(null);
  const compressorRef = useRef<any>(null);
  const outputGainRef = useRef<any>(null);
  const analyserRef = useRef<any>(null);
  const animRef = useRef(0);

  const dsp = useRef({
    effect: 'none' as EffectType,
    echoLevel: 0,
    noiseGate: false,
    counter: 0,
    pitchBuf: new Float32Array(PITCH_BUF),
    pW: 0,
    pR: 0,
    echoBuf: new Float32Array(ECHO_BUF),
    eW: 0,
  });

  // Sync React state to DSP ref (used in audio callback)
  useEffect(() => { dsp.current.effect = effect; }, [effect]);
  useEffect(() => { dsp.current.echoLevel = echoLevel; }, [echoLevel]);
  useEffect(() => { dsp.current.noiseGate = noiseGate; }, [noiseGate]);

  // Update Web Audio nodes when state changes
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

  // Cleanup on unmount
  useEffect(() => {
    return () => { cancelAnimationFrame(animRef.current); };
  }, []);

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

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const src = ctx.createMediaStreamSource(stream);

      // Input gain
      const ig = ctx.createGain();
      ig.gain.value = gain / 100;
      inputGainRef.current = ig;

      // Script processor — all DSP happens here for zero extra latency
      const proc = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      proc.onaudioprocess = (e: any) => {
        const inp = e.inputBuffer.getChannelData(0);
        const out = e.outputBuffer.getChannelData(0);
        const d = dsp.current;
        const sr = ctx.sampleRate;

        for (let i = 0; i < inp.length; i++) {
          let s = inp[i];

          // Noise gate
          if (d.noiseGate && Math.abs(s) < 0.015) {
            s = 0;
          }

          switch (d.effect) {
            case 'robotic': {
              const t = (d.counter + i) / sr;
              s *= Math.sin(2 * Math.PI * 200 * t);
              break;
            }
            case 'heavy':
            case 'chipmunk': {
              const factor = d.effect === 'heavy' ? 0.65 : 1.7;
              d.pitchBuf[d.pW] = inp[i];
              d.pW = (d.pW + 1) % PITCH_BUF;

              const ri = Math.floor(d.pR);
              const fr = d.pR - ri;
              const s0 = d.pitchBuf[ri % PITCH_BUF];
              const s1 = d.pitchBuf[(ri + 1) % PITCH_BUF];
              s = s0 * (1 - fr) + s1 * fr;

              d.pR = (d.pR + factor) % PITCH_BUF;

              // Keep read pointer in valid range relative to write pointer
              const dist = (d.pW - d.pR + PITCH_BUF) % PITCH_BUF;
              if (dist < BUFFER_SIZE * 2 || dist > PITCH_BUF - BUFFER_SIZE * 2) {
                d.pR = (d.pW - PITCH_BUF / 2 + PITCH_BUF) % PITCH_BUF;
              }
              break;
            }
            case 'echo': {
              if (d.echoLevel > 0) {
                const ms = [0, 100, 250, 500][d.echoLevel];
                const fb = [0, 0.3, 0.5, 0.7][d.echoLevel];
                const ds = Math.floor((ms / 1000) * sr);
                const rp = (d.eW - ds + ECHO_BUF) % ECHO_BUF;
                s += d.echoBuf[rp] * fb;
              }
              d.echoBuf[d.eW] = s;
              d.eW = (d.eW + 1) % ECHO_BUF;
              break;
            }
            default:
              break;
          }

          out[i] = s;
        }
        d.counter += inp.length;
      };

      // Compressor
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = compressor ? -24 : 0;
      comp.knee.value = 30;
      comp.ratio.value = compressor ? 12 : 1;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      compressorRef.current = comp;

      // Output gain
      const og = ctx.createGain();
      og.gain.value = volume / 100;
      outputGainRef.current = og;

      // Analyser for visualization
      const an = ctx.createAnalyser();
      an.fftSize = 64;
      an.smoothingTimeConstant = 0.75;
      analyserRef.current = an;

      // Chain: source → inputGain → processor → compressor → outputGain → analyser → speakers
      src.connect(ig);
      ig.connect(proc);
      proc.connect(comp);
      comp.connect(og);
      og.connect(an);
      an.connect(ctx.destination);

      setIsActive(true);

      // Start visualization loop (~30fps)
      let frameCount = 0;
      const vizLoop = () => {
        frameCount++;
        if (frameCount % 2 === 0 && analyserRef.current) {
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

  const stop = () => {
    cancelAnimationFrame(animRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t: any) => t.stop());
    }
    if (ctxRef.current) {
      ctxRef.current.close();
    }
    ctxRef.current = null;
    streamRef.current = null;
    inputGainRef.current = null;
    compressorRef.current = null;
    outputGainRef.current = null;
    analyserRef.current = null;

    // Reset DSP buffers
    dsp.current.pitchBuf.fill(0);
    dsp.current.echoBuf.fill(0);
    dsp.current.pW = 0;
    dsp.current.pR = 0;
    dsp.current.eW = 0;
    dsp.current.counter = 0;

    setWaveformData(new Array(32).fill(0));
    setIsActive(false);
  };

  const setEffect = (e: EffectType) => {
    // Reset buffers when switching effects to avoid artifacts
    dsp.current.pitchBuf.fill(0);
    dsp.current.pW = 0;
    dsp.current.pR = 0;
    dsp.current.echoBuf.fill(0);
    dsp.current.eW = 0;
    setEffectState(e);
  };

  return {
    isActive,
    effect,
    echoLevel,
    gain,
    volume,
    compressor,
    noiseGate,
    routing,
    waveformData,
    error,
    isWeb,
    toggle: () => (isActive ? stop() : start()),
    setEffect,
    setEchoLevel: setEchoLevelState,
    setGain: setGainState,
    setVolume: setVolumeState,
    toggleCompressor: () => setCompressorState((p) => !p),
    toggleNoiseGate: () => setNoiseGateState((p) => !p),
    setRouting: setRoutingState,
  };
}
