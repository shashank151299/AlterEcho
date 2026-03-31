import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudioEngine, EffectType, RouteType } from '../src/hooks/useAudioEngine';
import { COLORS } from '../src/constants/theme';

/* ─── Waveform Visualizer ─── */
const WaveformBars = ({ data, active }: { data: number[]; active: boolean }) => (
  <View style={s.vizWrap} testID="waveform-visualizer">
    {data.map((v, i) => (
      <View
        key={i}
        style={[
          s.vizBar,
          {
            height: active ? Math.max(4, (v / 255) * 96) : 4,
            opacity: active ? 0.4 + (v / 255) * 0.6 : 0.2,
          },
        ]}
      />
    ))}
  </View>
);

/* ─── Custom Slider ─── */
const SliderControl = ({
  value,
  onValueChange,
  label,
  icon,
  testID,
}: {
  value: number;
  onValueChange: (v: number) => void;
  label: string;
  icon: any;
  testID: string;
}) => {
  const [trackW, setTrackW] = useState(200);
  const thumbPos = (value / 100) * trackW;

  const handle = (e: any) => {
    const x = e.nativeEvent.locationX;
    onValueChange(Math.max(0, Math.min(100, Math.round((x / trackW) * 100))));
  };

  return (
    <View style={s.sliderWrap} testID={testID}>
      <View style={s.sliderHeader}>
        <View style={s.sliderLabelRow}>
          <Ionicons name={icon} size={14} color={COLORS.textSecondary} />
          <Text style={s.sliderLabel}>{label}</Text>
        </View>
        <Text style={s.sliderVal}>{value}%</Text>
      </View>
      <View
        style={s.sliderTrack}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handle}
        onResponderMove={handle}
      >
        <View style={[s.sliderFill, { width: thumbPos }]} />
        <View style={[s.sliderThumb, { left: thumbPos - 10 }]} />
      </View>
    </View>
  );
};

/* ─── Toggle Switch ─── */
const ToggleSwitch = ({
  label,
  isOn,
  onToggle,
  testID,
}: {
  label: string;
  isOn: boolean;
  onToggle: () => void;
  testID: string;
}) => (
  <TouchableOpacity
    testID={testID}
    onPress={onToggle}
    style={s.toggleRow}
    activeOpacity={0.7}
  >
    <Text style={s.toggleLabel}>{label}</Text>
    <View style={[s.switch, isOn && s.switchOn]}>
      <View style={[s.switchThumb, isOn && s.switchThumbOn]} />
    </View>
  </TouchableOpacity>
);

/* ─── Effect Button ─── */
const EffectBtn = ({
  icon,
  label,
  active,
  onPress,
  testID,
}: {
  icon: any;
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) => (
  <TouchableOpacity
    testID={testID}
    onPress={onPress}
    style={[s.effectBtn, active && s.effectBtnOn]}
    activeOpacity={0.7}
  >
    <Ionicons
      name={icon}
      size={28}
      color={active ? COLORS.primary : COLORS.textSecondary}
    />
    <Text style={[s.effectBtnLabel, active && s.effectBtnLabelOn]}>
      {label}
    </Text>
  </TouchableOpacity>
);

/* ─── Echo Level Pills ─── */
const EchoLevels = ({
  level,
  onSelect,
}: {
  level: number;
  onSelect: (n: number) => void;
}) => (
  <View style={s.echoRow}>
    {[0, 1, 2, 3].map((n) => (
      <TouchableOpacity
        key={n}
        testID={`echo-level-${n}`}
        onPress={() => onSelect(n)}
        style={[s.echoPill, level === n && s.echoPillOn]}
      >
        <Text style={[s.echoPillText, level === n && s.echoPillTextOn]}>
          {n === 0 ? 'OFF' : `L${n}`}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

/* ─── Routing Button ─── */
const RouteBtn = ({
  icon,
  label,
  active,
  onPress,
  testID,
}: {
  icon: any;
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) => (
  <TouchableOpacity
    testID={testID}
    onPress={onPress}
    style={[s.routeBtn, active && s.routeBtnOn]}
    activeOpacity={0.7}
  >
    <Ionicons
      name={icon}
      size={16}
      color={active ? COLORS.primary : COLORS.textSecondary}
    />
    <Text style={[s.routeBtnText, active && s.routeBtnTextOn]}>{label}</Text>
  </TouchableOpacity>
);

/* ═══════════════════════════════════════════════
   MAIN SCREEN
   ═══════════════════════════════════════════════ */
export default function AlterEchoScreen() {
  const insets = useSafeAreaInsets();
  const engine = useAudioEngine();

  const effects: { key: EffectType; icon: any; label: string }[] = [
    { key: 'robotic', icon: 'hardware-chip-outline', label: 'Robotic' },
    { key: 'heavy', icon: 'arrow-down-circle-outline', label: 'Heavy' },
    { key: 'chipmunk', icon: 'arrow-up-circle-outline', label: 'Chipmunk' },
    { key: 'echo', icon: 'radio-outline', label: 'Echo' },
  ];

  const routes: { key: RouteType; icon: any; label: string }[] = [
    { key: 'speaker', icon: 'volume-high-outline', label: 'Speaker' },
    { key: 'headphones', icon: 'headset-outline', label: 'Headphones' },
    { key: 'bluetooth', icon: 'bluetooth-outline', label: 'Bluetooth' },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]} testID="alter-echo-screen">
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.titleRow}>
            <Text style={s.titleBold}>ALTER</Text>
            <Text style={s.titleCyan}>ECHO</Text>
          </View>
          <TouchableOpacity
            testID="master-power-btn"
            onPress={engine.toggle}
            style={[s.powerBtn, engine.isActive && s.powerBtnOn]}
            activeOpacity={0.7}
          >
            <Ionicons
              name="power"
              size={24}
              color={engine.isActive ? '#09090B' : COLORS.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* ── Waveform ── */}
        <WaveformBars data={engine.waveformData} active={engine.isActive} />

        {/* ── Status ── */}
        <View style={s.statusRow}>
          <View style={[s.statusDot, engine.isActive && s.statusDotOn]} />
          <Text style={s.statusText}>
            {engine.isActive ? 'PROCESSING' : 'STANDBY'}
          </Text>
          {engine.effect !== 'none' && engine.isActive && (
            <Text style={s.statusEffect}>
              {engine.effect.toUpperCase()}
            </Text>
          )}
        </View>

        {engine.error && (
          <View style={s.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
            <Text style={s.errorText}>{engine.error}</Text>
          </View>
        )}

        {!engine.isWeb && (
          <View style={s.errorBanner}>
            <Ionicons name="information-circle" size={16} color={COLORS.warning} />
            <Text style={s.errorText}>
              Real-time audio processing requires web preview
            </Text>
          </View>
        )}

        {/* ── Input Card ── */}
        <View style={s.card} testID="input-card">
          <View style={s.cardHead}>
            <Text style={s.cardLabel}>INPUT</Text>
            <Ionicons name="mic" size={18} color={COLORS.primary} />
          </View>
          <SliderControl
            testID="gain-slider"
            value={engine.gain}
            onValueChange={engine.setGain}
            label="GAIN"
            icon="mic-outline"
          />
          <View style={s.togglesRow}>
            <ToggleSwitch
              testID="noise-gate-toggle"
              label="Noise Gate"
              isOn={engine.noiseGate}
              onToggle={engine.toggleNoiseGate}
            />
            <ToggleSwitch
              testID="compressor-toggle"
              label="Compressor"
              isOn={engine.compressor}
              onToggle={engine.toggleCompressor}
            />
          </View>
        </View>

        {/* ── Effects ── */}
        <View style={s.card} testID="effects-card">
          <Text style={s.cardLabel}>EFFECTS</Text>
          <View style={s.effectsGrid}>
            {effects.map((fx) => (
              <EffectBtn
                key={fx.key}
                testID={`${fx.key}-effect-btn`}
                icon={fx.icon}
                label={fx.label}
                active={engine.effect === fx.key}
                onPress={() =>
                  engine.setEffect(engine.effect === fx.key ? 'none' : fx.key)
                }
              />
            ))}
          </View>
          {engine.effect === 'echo' && (
            <EchoLevels
              level={engine.echoLevel}
              onSelect={engine.setEchoLevel}
            />
          )}
        </View>

        {/* ── Output Card ── */}
        <View style={s.card} testID="output-card">
          <View style={s.cardHead}>
            <Text style={s.cardLabel}>OUTPUT</Text>
            <Ionicons name="volume-high" size={18} color={COLORS.primary} />
          </View>
          <SliderControl
            testID="volume-slider"
            value={engine.volume}
            onValueChange={engine.setVolume}
            label="VOLUME"
            icon="volume-medium-outline"
          />
          <View style={s.routeRow}>
            {routes.map((r) => (
              <RouteBtn
                key={r.key}
                testID={`${r.key}-route-btn`}
                icon={r.icon}
                label={r.label}
                active={engine.routing === r.key}
                onPress={() => engine.setRouting(r.key)}
              />
            ))}
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            {Platform.OS === 'web'
              ? 'Web Audio API • 256-sample buffer • ~6ms latency'
              : 'Connect via web preview for real-time audio'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════ */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48, gap: 20 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline' },
  titleBold: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -1,
  },
  titleCyan: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -1,
  },
  powerBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  powerBtnOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    boxShadow: '0 0 16px rgba(6, 182, 212, 0.7)',
  },

  // Waveform
  vizWrap: {
    height: 120,
    backgroundColor: 'rgba(24,24,27,0.5)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(39,39,42,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  vizBar: {
    width: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 3,
    marginHorizontal: 1.5,
    minHeight: 4,
  },

  // Status
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.textMuted,
  },
  statusDotOn: {
    backgroundColor: COLORS.success,
    boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: COLORS.textSecondary,
  },
  statusEffect: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: COLORS.primary,
    backgroundColor: COLORS.primaryDim,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  errorText: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },

  // Card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 16,
    boxShadow: '0 8px 16px rgba(0, 0, 0, 0.4)',
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    color: COLORS.primary,
  },

  // Slider
  sliderWrap: { gap: 10 },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sliderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  sliderVal: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  sliderTrack: {
    height: 8,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 4,
    justifyContent: 'center',
  },
  sliderFill: {
    height: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  sliderThumb: {
    position: 'absolute',
    top: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: COLORS.primary,
    boxShadow: '0 0 6px rgba(6, 182, 212, 0.5)',
  },

  // Toggles
  togglesRow: { flexDirection: 'row', gap: 12 },
  toggleRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  switch: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3F3F46',
    padding: 2,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: COLORS.primary },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },
  switchThumbOn: { alignSelf: 'flex-end' },

  // Effects
  effectsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  effectBtn: {
    width: '47%' as any,
    flexGrow: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  effectBtnOn: {
    backgroundColor: COLORS.primaryDim,
    borderColor: COLORS.primary,
    boxShadow: '0 0 10px rgba(6, 182, 212, 0.25)',
  },
  effectBtnLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  effectBtnLabelOn: { color: COLORS.primary },

  // Echo pills
  echoRow: { flexDirection: 'row', gap: 8 },
  echoPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  echoPillOn: {
    backgroundColor: COLORS.primaryDim,
    borderColor: COLORS.primary,
  },
  echoPillText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary },
  echoPillTextOn: { color: COLORS.primary },

  // Routing
  routeRow: { flexDirection: 'row', gap: 8 },
  routeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  routeBtnOn: {
    backgroundColor: COLORS.primaryDim,
    borderColor: COLORS.primary,
  },
  routeBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  routeBtnTextOn: { color: COLORS.primary },

  // Footer
  footer: { alignItems: 'center', paddingVertical: 8 },
  footerText: {
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
});
