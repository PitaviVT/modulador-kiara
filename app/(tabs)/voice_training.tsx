import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BOT_API_URL } from '@/constants/kiara';

// ── Training Scripts ───────────────────────────────────────────────────────
const TRAINING_SCRIPTS = [
  {
    id: 'pres',
    title: 'Presentación',
    text: 'Hola a todos, me llamo Kiara y estoy muy contenta de poder ayudaros. Mi objetivo es hacer vuestra vida más fácil y entretenida. Podemos hablar de cualquier tema que os interese.',
  },
  {
    id: 'naturaleza',
    title: 'Naturaleza',
    text: 'El bosque en otoño es un espectáculo de colores cálidos. Las hojas rojas, amarillas y naranjas caen lentamente al suelo mientras el viento frío anuncia la llegada del invierno. Los animales se preparan para la estación más dura del año.',
  },
  {
    id: 'numeros',
    title: 'Números',
    text: 'La Tierra tarda trescientos sesenta y cinco días en dar la vuelta al sol. La distancia entre la Tierra y la Luna es de aproximadamente trescientos ochenta y cuatro mil kilómetros. El agua hierve a cien grados centígrados al nivel del mar.',
  },
  {
    id: 'cuento',
    title: 'Cuento',
    text: 'Había una vez una niña que vivía en un pequeño pueblo junto al mar. Cada mañana salía a caminar por la orilla y recogía conchas de colores. Un día encontró una concha muy especial que brillaba como el sol.',
  },
  {
    id: 'tech',
    title: 'Tecnología',
    text: 'La inteligencia artificial está transformando nuestra manera de trabajar y comunicarnos. Los sistemas de reconocimiento de voz han mejorado enormemente en los últimos años gracias a las redes neuronales profundas y al aprendizaje automático.',
  },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────
type WordStatus = 'pending' | 'correct' | 'wrong';

type Take = {
  id: string;
  blob: Blob;
  durationSec: number;
  url: string;
  label?: string;
};

type ServerStatus = {
  tts_local: boolean;
  has_reference: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

const getBestMime = () => {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
  return types.find(t => (window as any).MediaRecorder?.isTypeSupported?.(t)) || 'audio/webm';
};

const normalizeWord = (w: string) =>
  w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

const SpeechRecognitionAPI: any =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

// ── Component ──────────────────────────────────────────────────────────────
export default function VoiceTrainingScreen() {
  // Shared
  const [takes, setTakes]         = useState<Take[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus]       = useState<ServerStatus | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Free recording
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration]       = useState(0);
  const recorderRef = useRef<any>(null);
  const chunksRef   = useRef<BlobPart[]>([]);
  const timerRef    = useRef<any>(null);
  const pulseAnim   = useRef(new Animated.Value(1)).current;

  // Guided recording
  const [selectedScript, setSelectedScript] = useState<typeof TRAINING_SCRIPTS[number] | null>(null);
  const [guidedWords, setGuidedWords]       = useState<Array<{ word: string; status: WordStatus }>>([]);
  const [isGuideRecording, setIsGuideRecording] = useState(false);
  const [guideDuration, setGuideDuration]       = useState(0);
  const guideRecorderRef = useRef<any>(null);
  const guideChunksRef   = useRef<BlobPart[]>([]);
  const guideTimerRef    = useRef<any>(null);
  const guideActiveRef   = useRef(false);
  const guideFinalRef    = useRef('');
  const guidePulseAnim   = useRef(new Animated.Value(1)).current;

  // Polling
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${BOT_API_URL}/status`);
        if (res.ok) setStatus(await res.json());
      } catch { setStatus(null); }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])).start();
    } else {
      Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: false }).start();
    }
  }, [isRecording]);

  useEffect(() => {
    if (isGuideRecording) {
      Animated.loop(Animated.sequence([
        Animated.timing(guidePulseAnim, { toValue: 1.3, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(guidePulseAnim, { toValue: 1,   duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])).start();
    } else {
      Animated.spring(guidePulseAnim, { toValue: 1, useNativeDriver: false }).start();
    }
  }, [isGuideRecording]);

  // ── Script selection ──────────────────────────────────────────────────
  const selectScript = (script: typeof TRAINING_SCRIPTS[number]) => {
    if (isGuideRecording) return;
    setSelectedScript(script);
    const words = script.text.split(/\s+/).filter(Boolean);
    setGuidedWords(words.map(w => ({ word: w, status: 'pending' })));
    guideFinalRef.current = '';
  };

  const updateWordStatuses = (transcript: string, script: typeof TRAINING_SCRIPTS[number]) => {
    const spoken = transcript.trim().split(/\s+/).map(normalizeWord).filter(Boolean);
    const scriptWords = script.text.split(/\s+/).filter(Boolean);
    setGuidedWords(scriptWords.map((word, i) => ({
      word,
      status: i >= spoken.length
        ? 'pending'
        : normalizeWord(word) === spoken[i] ? 'correct' : 'wrong',
    })));
  };

  // ── Guided Recording ──────────────────────────────────────────────────
  const startGuideRecording = async () => {
    if (!selectedScript) return;
    const script = selectedScript;
    guideFinalRef.current = '';
    setGuidedWords(script.text.split(/\s+/).filter(Boolean).map(w => ({ word: w, status: 'pending' })));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = getBestMime();
      const rec    = new (window as any).MediaRecorder(stream, { mimeType: mime });
      guideChunksRef.current = [];

      rec.ondataavailable = (e: any) => { if (e.data.size > 0) guideChunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(guideChunksRef.current, { type: mime });
        const url  = URL.createObjectURL(blob);
        setTakes(prev => [...prev, {
          id: Date.now().toString(),
          blob, url,
          durationSec: guideDuration,
          label: script.title,
        }]);
      };

      guideRecorderRef.current = rec;
      rec.start(200);

      // Speech recognition for visual feedback only
      guideActiveRef.current = true;
      if (SpeechRecognitionAPI) {
        const launchSession = () => {
          if (!guideActiveRef.current) return;
          const recognition = new SpeechRecognitionAPI();
          recognition.lang = 'es-MX';
          recognition.continuous = false;
          recognition.interimResults = true;

          recognition.onresult = (e: any) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const t = e.results[i][0].transcript;
              if (e.results[i].isFinal) guideFinalRef.current += ' ' + t;
              else interim = t;
            }
            updateWordStatuses((guideFinalRef.current + ' ' + interim).trim(), script);
          };

          recognition.onend = () => {
            if (guideActiveRef.current) setTimeout(launchSession, 100);
          };

          recognition.onerror = (e: any) => {
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
              guideActiveRef.current = false;
            }
          };

          try { recognition.start(); } catch {}
        };
        launchSession();
      }

      setIsGuideRecording(true);
      setGuideDuration(0);
      guideTimerRef.current = setInterval(() => setGuideDuration(d => d + 1), 1000);
    } catch (err: any) {
      Alert.alert('Micrófono', err.message ?? 'No se pudo acceder al micrófono.');
    }
  };

  const stopGuideRecording = () => {
    clearInterval(guideTimerRef.current);
    guideActiveRef.current = false;
    guideRecorderRef.current?.stop();
    setIsGuideRecording(false);
  };

  // ── Free Recording ────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = getBestMime();
      const rec    = new (window as any).MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e: any) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        const url  = URL.createObjectURL(blob);
        setTakes(prev => [...prev, { id: Date.now().toString(), blob, url, durationSec: duration }]);
      };
      recorderRef.current = rec;
      rec.start(200);
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (err: any) {
      Alert.alert('Micrófono', err.message ?? 'No se pudo acceder al micrófono.');
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  // ── Playback ──────────────────────────────────────────────────────────
  const playTake = (take: Take) => {
    audioRef.current?.pause();
    if (playingId === take.id) { setPlayingId(null); return; }
    const audio = new Audio(take.url);
    audioRef.current = audio;
    audio.play();
    setPlayingId(take.id);
    audio.onended = () => setPlayingId(null);
  };

  const deleteTake = (id: string) => {
    setTakes(prev => {
      const t = prev.find(t => t.id === id);
      if (t) URL.revokeObjectURL(t.url);
      return prev.filter(t => t.id !== id);
    });
  };

  // ── Upload Reference ──────────────────────────────────────────────────
  const uploadReference = async (take: Take) => {
    setUploading(take.id);
    try {
      const res = await fetch(`${BOT_API_URL}/upload-reference`, {
        method: 'POST',
        headers: { 'Content-Type': take.blob.type },
        body: take.blob,
      });
      if (res.ok) {
        Alert.alert('✅ Listo', 'Audio de referencia actualizado.\nEl servidor XTTS usará tu voz en el próximo mensaje.');
        const s = await fetch(`${BOT_API_URL}/status`);
        if (s.ok) setStatus(await s.json());
      } else {
        Alert.alert('Error', await res.text());
      }
    } catch {
      Alert.alert('Error', 'No se pudo conectar con el servidor.');
    } finally {
      setUploading(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.headerTitle}>KIARA TRAINING</Text>
      <Text style={styles.headerSubtitle}>Voice Model Builder</Text>

      {/* Estado del sistema */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>ESTADO DEL SISTEMA</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: status?.tts_local ? '#2ED573' : '#FF4757' }]} />
          <Text style={styles.statusText}>
            Servidor XTTS: {status === null ? '...' : status.tts_local ? 'Activo' : 'Offline'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: status?.has_reference ? '#2ED573' : '#FFA502' }]} />
          <Text style={styles.statusText}>
            Audio de referencia: {status === null ? '...' : status.has_reference ? 'Presente' : 'Sin configurar'}
          </Text>
        </View>
      </View>

      {/* Lectura guiada */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>LECTURA GUIADA</Text>
        <Text style={styles.tip}>
          Elige un texto y léelo en voz alta mientras grabas.{'\n'}
          Gris = reconocida · Rojo = no coincidió · Blanco = pendiente
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scriptScroll}>
          {TRAINING_SCRIPTS.map(script => (
            <TouchableOpacity
              key={script.id}
              style={[styles.scriptChip, selectedScript?.id === script.id && styles.scriptChipActive]}
              onPress={() => selectScript(script)}
              activeOpacity={0.7}
            >
              <Text style={[styles.scriptChipText, selectedScript?.id === script.id && styles.scriptChipTextActive]}>
                {script.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {selectedScript ? (
          <>
            <View style={styles.scriptTextBox}>
              <Text>
                {guidedWords.map((item, i) => (
                  <Text
                    key={i}
                    style={[
                      styles.scriptWord,
                      item.status === 'correct' && styles.wordCorrect,
                      item.status === 'wrong'   && styles.wordWrong,
                    ]}
                  >
                    {item.word}{' '}
                  </Text>
                ))}
              </Text>
            </View>

            <View style={styles.micWrapper}>
              <Animated.View style={[styles.pulse, { transform: [{ scale: guidePulseAnim }], opacity: isGuideRecording ? 1 : 0 }]} />
              <TouchableOpacity
                style={[styles.micBtn, isGuideRecording ? styles.micBtnActive : styles.micBtnIdle]}
                onPress={isGuideRecording ? stopGuideRecording : startGuideRecording}
                activeOpacity={0.85}
                disabled={isRecording}
              >
                <IconSymbol name={isGuideRecording ? 'waveform' : 'mic.fill'} size={38} color="white" />
              </TouchableOpacity>
            </View>

            {isGuideRecording && <Text style={styles.timer}>{fmt(guideDuration)}</Text>}
            <Text style={styles.recHint}>
              {isGuideRecording ? 'Grabando… pulsa para detener' : 'Pulsa para grabar la lectura'}
            </Text>
          </>
        ) : (
          <Text style={styles.scriptPlaceholder}>Selecciona un texto para empezar</Text>
        )}
      </View>

      {/* Grabación libre */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>GRABACIÓN LIBRE</Text>
        <Text style={styles.tip}>
          Habla con naturalidad durante al menos 30 segundos.{'\n'}
          Sin ruido de fondo, voz clara y constante.
        </Text>

        <View style={styles.micWrapper}>
          <Animated.View style={[styles.pulse, { transform: [{ scale: pulseAnim }], opacity: isRecording ? 1 : 0 }]} />
          <TouchableOpacity
            style={[styles.micBtn, isRecording ? styles.micBtnActive : styles.micBtnIdle]}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.85}
            disabled={isGuideRecording}
          >
            <IconSymbol name={isRecording ? 'waveform' : 'mic.fill'} size={38} color="white" />
          </TouchableOpacity>
        </View>

        {isRecording && <Text style={styles.timer}>{fmt(duration)}</Text>}
        <Text style={styles.recHint}>
          {isRecording ? 'Grabando… pulsa para detener' : 'Pulsa para grabar'}
        </Text>
      </View>

      {/* Takes */}
      {takes.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>TAKES ({takes.length})</Text>
          {takes.map((take, i) => (
            <View key={take.id} style={styles.takeRow}>
              <View style={styles.takeInfo}>
                <Text style={styles.takeName}>{take.label ?? `Take ${i + 1}`}</Text>
                <Text style={styles.takeDur}>{fmt(take.durationSec)}</Text>
              </View>

              <TouchableOpacity style={styles.takeBtn} onPress={() => playTake(take)}>
                <IconSymbol
                  name={playingId === take.id ? 'pause.circle.fill' : 'waveform'}
                  size={20}
                  color="#5865F2"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.takeBtn, styles.takeBtnUpload]}
                onPress={() => uploadReference(take)}
                disabled={uploading === take.id}
              >
                {uploading === take.id
                  ? <ActivityIndicator color="white" size="small" />
                  : <Text style={styles.takeBtnText}>Usar</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity style={styles.takeBtn} onPress={() => deleteTake(take.id)}>
                <IconSymbol name="mic.slash.fill" size={18} color="#FF4757" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:      { flexGrow: 1, padding: 30, alignItems: 'center', backgroundColor: '#F8F9FD' },
  headerTitle:    { fontSize: 26, fontWeight: '900', color: '#1A1A1B', letterSpacing: 1.5 },
  headerSubtitle: { fontSize: 11, color: '#A4B0BE', fontWeight: 'bold', marginBottom: 40, textTransform: 'uppercase' },

  card:      { width: '100%', backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  cardLabel: { fontSize: 9, fontWeight: '900', color: '#CED6E0', marginBottom: 12 },

  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  dot:       { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  statusText:{ fontSize: 13, color: '#2D3436', fontWeight: '600' },

  tip: { fontSize: 12, color: '#A4B0BE', lineHeight: 18, marginBottom: 16 },

  scriptScroll:         { marginBottom: 16 },
  scriptChip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F2F6', marginRight: 8 },
  scriptChipActive:     { backgroundColor: '#5865F2' },
  scriptChipText:       { fontSize: 12, fontWeight: '700', color: '#636E72' },
  scriptChipTextActive: { color: 'white' },
  scriptPlaceholder:    { fontSize: 13, color: '#CED6E0', textAlign: 'center', paddingVertical: 20, fontStyle: 'italic' },

  scriptTextBox: { backgroundColor: '#F8F9FD', borderRadius: 16, padding: 16, marginBottom: 20 },
  scriptWord:    { fontSize: 16, lineHeight: 30, color: '#2D3436', fontWeight: '500' },
  wordCorrect:   { color: '#B2BEC3' },
  wordWrong:     { color: '#FF4757' },

  micWrapper:  { alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  pulse:       { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,71,87,0.15)' },
  micBtn:      { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center', elevation: 6 },
  micBtnIdle:  { backgroundColor: '#2D3436' },
  micBtnActive:{ backgroundColor: '#FF4757' },

  timer:   { textAlign: 'center', fontSize: 32, fontWeight: '800', color: '#FF4757', marginTop: 14, fontVariant: ['tabular-nums'] },
  recHint: { textAlign: 'center', fontSize: 12, color: '#A4B0BE', fontWeight: '700', marginTop: 6, marginBottom: 4 },

  takeRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F2F6' },
  takeInfo:      { flex: 1 },
  takeName:      { fontSize: 13, fontWeight: '700', color: '#2D3436' },
  takeDur:       { fontSize: 11, color: '#A4B0BE' },
  takeBtn:       { padding: 8, marginLeft: 6 },
  takeBtnUpload: { backgroundColor: '#5865F2', borderRadius: 10, paddingHorizontal: 14 },
  takeBtnText:   { color: 'white', fontWeight: '800', fontSize: 12 },
});
