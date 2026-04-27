import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Animated, Easing, Image, Modal } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTextToSpeech } from '../functions/text_to_speech';
import { useSpeechToText } from '../functions/speech_to_text';
import { useServerSTT } from '../functions/useServerSTT';
import { useDiscordConnection } from '../functions/useDiscordConnection';
import { BOT_API_URL, DISCORD_LOGO } from '@/constants/kiara';

type STTMode = 'google' | 'kiara';

export default function HablarScreen() {
  const [transcript, setTranscript]       = useState('');
  const [isSending, setIsSending]         = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [voiceSearch, setVoiceSearch]     = useState('');
  const [sttMode, setSttMode]             = useState<STTMode>('google');
  const [chromaMode, setChromaMode]       = useState(false);

  const sttModeRef = useRef<STTMode>('google');
  useEffect(() => { sttModeRef.current = sttMode; }, [sttMode]);

  const { useDiscord, setUseDiscord, useDiscordRef, isCheckingBot, toggleDiscordMode } = useDiscordConnection();
  const timeoutRef = useRef<any>(null);
  const pulseAnim  = useRef(new Animated.Value(1)).current;

  const { voices, selectedVoiceIndex, setSelectedVoiceIndex, speak: speakLocal } = useTextToSpeech();

  const getVoiceBadge = (name: string): string => {
    if (name.includes('Google'))    return 'Chrome';
    if (name.includes('Microsoft')) return 'Edge';
    if (name.includes('Mozilla'))   return 'Firefox';
    return '';
  };

  // Shared transcript handler used by both STT backends
  const handleTranscript = (text: string) => {
    if (!text) return;
    setTranscript(text);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const currentVoice     = voices[selectedVoiceIndex]?.name || 'default';
    const currentVoiceLang = voices[selectedVoiceIndex]?.lang || 'es-ES';

    if (useDiscordRef.current) {
      sendToDiscord(text, currentVoice, currentVoiceLang);
    } else {
      speakLocal(text);
    }
    timeoutRef.current = setTimeout(() => setTranscript(''), 4000);
  };

  // Google Web Speech API
  const { isActive: googleActive, startRecognition: googleStart, stopRecognition: googleStop } =
    useSpeechToText((text) => {
      if (sttModeRef.current === 'google') handleTranscript(text);
    });

  // Whisper via local server
  const { isActive: whisperActive, isProcessing: whisperProcessing, startRecognition: whisperStart, stopRecognition: whisperStop } =
    useServerSTT((text) => {
      if (sttModeRef.current === 'kiara') handleTranscript(text);
    });

  const isActive        = sttMode === 'google' ? googleActive      : whisperActive;
  const startRecognition = sttMode === 'google' ? googleStart       : whisperStart;
  const stopRecognition  = sttMode === 'google' ? googleStop        : whisperStop;
  const isProcessingSTT  = sttMode === 'kiara'  ? whisperProcessing : false;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      ).start();
    } else {
      Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: false }).start();
    }
  }, [isActive]);

  // ── Send to Discord ───────────────────────────────────────────────────
  const sendToDiscord = async (text: string, voiceName: string, voiceLang: string) => {
    if (!text.trim()) return;
    try {
      setIsSending(true);
      const response = await fetch(`${BOT_API_URL}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceName, voiceLang }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn('[DEBUG] El servidor rechazó el mensaje:', errText);
        if (response.status === 400) setUseDiscord(false);
        return;
      }

      const audioBlob = await response.blob();
      const blobUrl   = URL.createObjectURL(audioBlob);
      const audio     = new Audio(blobUrl);
      audio.play();
      audio.onended = () => URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error en el envío:', error);
      setUseDiscord(false);
    } finally {
      setIsSending(false);
    }
  };

  // ── Mic toggle ────────────────────────────────────────────────────────
  const handleToggleMic = async () => {
    if (isActive) {
      stopRecognition();
      return;
    }

    try {
      const perm = await navigator.permissions?.query({ name: 'microphone' as PermissionName });

      if (perm?.state === 'denied') {
        Alert.alert(
          'Micrófono bloqueado',
          'El acceso al micrófono está bloqueado. Haz clic en el candado de la barra de dirección y permite el micrófono para este sitio.'
        );
        return;
      }

      if (perm?.state !== 'granted') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        Alert.alert('Permiso denegado', 'Kiara necesita el micrófono. Actívalo en la configuración del sitio del navegador.');
        return;
      }
    }

    if (!useDiscord && sttMode === 'google') speakLocal('');
    try { startRecognition(); } catch {}
  };

  // Switch STT mode (stops any active recognition first)
  const switchSTTMode = (mode: STTMode) => {
    if (googleActive)  googleStop();
    if (whisperActive) whisperStop();
    setSttMode(mode);
  };

  return (
    <>
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.headerTitle}>KIARA CONTROL</Text>
      <Text style={styles.headerSubtitle}>Hybrid Voice System</Text>

      <TouchableOpacity
        style={styles.chromaEntryBtn}
        onPress={() => setChromaMode(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.chromaEntryText}>CROMA</Text>
      </TouchableOpacity>

      {/* Discord mode */}
      <View style={styles.modeCard}>
        <View style={styles.modeInfo}>
          <TouchableOpacity
            onPress={toggleDiscordMode}
            disabled={isCheckingBot}
            activeOpacity={0.7}
            style={[styles.discordButton, useDiscord ? styles.discordActive : styles.discordInactive]}
          >
            {isCheckingBot ? (
              <ActivityIndicator color={useDiscord ? 'white' : '#5865F2'} size="small" />
            ) : (
              <Image
                source={{ uri: DISCORD_LOGO }}
                style={styles.discordLogo}
                tintColor={useDiscord ? undefined : '#A4B0BE'}
              />
            )}
          </TouchableOpacity>
          <View>
            <Text style={[styles.modeTitle, { color: useDiscord ? '#5865F2' : '#2D3436' }]}>
              {useDiscord ? 'Discord Activo' : 'Discord Desconectado'}
            </Text>
            <Text style={styles.modeDesc}>
              {isCheckingBot ? 'Conectando Kiara...' : 'Presiona el logo para entrar'}
            </Text>
          </View>
        </View>
      </View>

      {/* STT mode selector */}
      <View style={styles.sttCard}>
        <Text style={styles.sttCardLabel}>RECONOCIMIENTO DE VOZ</Text>
        <View style={styles.sttToggleRow}>
          <TouchableOpacity
            style={[styles.sttPill, sttMode === 'google' && styles.sttPillActive]}
            onPress={() => switchSTTMode('google')}
            activeOpacity={0.7}
          >
            <Text style={[styles.sttPillText, sttMode === 'google' && styles.sttPillTextActive]}>
              Google
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sttPill, sttMode === 'kiara' && styles.sttPillActive]}
            onPress={() => switchSTTMode('kiara')}
            activeOpacity={0.7}
          >
            <Text style={[styles.sttPillText, sttMode === 'kiara' && styles.sttPillTextActive]}>
              Kiara (Whisper)
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sttDesc}>
          {sttMode === 'google'
            ? 'Reconocimiento de voz del navegador — rápido, online'
            : 'Whisper local — más preciso, funciona sin conexión'}
        </Text>
      </View>

      {/* Voice selector */}
      <View style={styles.voiceCard}>
        <Text style={styles.voiceCardLabel}>VOZ</Text>
        <TouchableOpacity
          style={styles.voiceSelector}
          onPress={() => setShowVoicePicker(v => !v)}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.voiceSelectedName} numberOfLines={1}>
              {voices[selectedVoiceIndex]?.name || 'Sin voces disponibles'}
            </Text>
            <Text style={styles.voiceSelectedLang}>
              {voices[selectedVoiceIndex]?.lang || ''}
            </Text>
          </View>
          <Text style={styles.voiceChevron}>{showVoicePicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showVoicePicker && (
          <View>
            <TextInput
              style={styles.voiceSearchInput}
              placeholder="Buscar voz..."
              placeholderTextColor="#B2BEC3"
              value={voiceSearch}
              onChangeText={setVoiceSearch}
              autoFocus
            />
            <ScrollView style={styles.voiceList} nestedScrollEnabled>
              {voices
                .map((voice, index) => ({ voice, index }))
                .filter(({ voice }) => voice.name.toLowerCase().includes(voiceSearch.toLowerCase()))
                .map(({ voice, index }) => {
                  const badge      = getVoiceBadge(voice.name);
                  const isSelected = index === selectedVoiceIndex;
                  return (
                    <TouchableOpacity
                      key={`${voice.name}-${index}`}
                      style={[styles.voiceItem, isSelected && styles.voiceItemActive]}
                      onPress={() => { setSelectedVoiceIndex(index); setShowVoicePicker(false); setVoiceSearch(''); }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.voiceItemName, isSelected && styles.voiceItemNameActive]} numberOfLines={1}>
                          {voice.name}
                        </Text>
                        <Text style={styles.voiceItemLang}>{voice.lang}</Text>
                      </View>
                      {badge ? (
                        <View style={styles.voiceBadge}>
                          <Text style={styles.voiceBadgeText}>{badge}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Mic button */}
      <View style={styles.micWrapper}>
        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }, isActive && styles.activePulse]} />
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.roundButton, isActive ? styles.btnActive : styles.btnDisabled, (isSending || isProcessingSTT) && styles.btnSending]}
          onPress={handleToggleMic}
          disabled={isSending || isCheckingBot}
        >
          {isSending || isProcessingSTT ? (
            <ActivityIndicator color="white" size="large" />
          ) : (
            <IconSymbol size={42} name={isActive ? 'waveform' : 'mic.fill'} color="white" />
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.statusHint}>
        {isActive
          ? 'Escuchando voz...'
          : isProcessingSTT
          ? 'Procesando con Whisper...'
          : isSending
          ? 'Kiara está hablando...'
          : 'Presiona para hablar'}
      </Text>

      <View style={styles.transcriptContainer}>
        <View style={styles.transcriptHeader}>
          <Text style={styles.transcriptLabel}>TRANSCRIPCIÓN ACTUAL</Text>
          {isActive && <View style={styles.liveDot} />}
        </View>
        <Text style={styles.transcriptText}>{transcript || '...'}</Text>
      </View>
    </ScrollView>

    <Modal visible={chromaMode} animationType="fade" transparent={false}>
      <View style={styles.chromaOverlay}>
        <Text style={styles.chromaText}>{transcript}</Text>
        <View style={styles.chromaControls}>
          <TouchableOpacity
            style={[styles.chromaCtrlBtn, useDiscord && styles.chromaCtrlBtnDiscord]}
            onPress={toggleDiscordMode}
            disabled={isCheckingBot}
            activeOpacity={0.6}
          >
            {isCheckingBot ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Image
                source={{ uri: DISCORD_LOGO }}
                style={styles.chromaCtrlIcon}
                tintColor={useDiscord ? undefined : 'rgba(0,0,0,0.5)'}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chromaCtrlBtn, isActive && styles.chromaCtrlBtnMic]}
            onPress={handleToggleMic}
            disabled={isSending || isCheckingBot}
            activeOpacity={0.6}
          >
            <IconSymbol
              size={20}
              name={isActive ? 'waveform' : 'mic.fill'}
              color={isActive ? '#fff' : 'rgba(0,0,0,0.6)'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.chromaCtrlBtn}
            onPress={() => setChromaMode(false)}
            activeOpacity={0.6}
          >
            <Text style={styles.chromaCtrlClose}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container:      { flexGrow: 1, padding: 30, alignItems: 'center', backgroundColor: '#F8F9FD' },
  headerTitle:    { fontSize: 26, fontWeight: '900', color: '#1A1A1B', letterSpacing: 1.5 },
  headerSubtitle: { fontSize: 11, color: '#A4B0BE', fontWeight: 'bold', marginBottom: 40, textTransform: 'uppercase' },

  modeCard: { width: '100%', padding: 15, backgroundColor: '#FFF', borderRadius: 24, elevation: 3, marginBottom: 16, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  modeInfo: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  discordButton:   { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 5 },
  discordActive:   { backgroundColor: '#5865F2' },
  discordInactive: { backgroundColor: '#F1F2F6' },
  discordLogo:     { width: 38, height: 38, resizeMode: 'contain' },
  modeTitle: { fontWeight: '800', fontSize: 16 },
  modeDesc:  { fontSize: 11, color: '#A4B0BE' },

  sttCard:       { width: '100%', backgroundColor: '#FFF', borderRadius: 24, padding: 16, marginBottom: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  sttCardLabel:  { fontSize: 9, fontWeight: '900', color: '#CED6E0', marginBottom: 12 },
  sttToggleRow:  { flexDirection: 'row', gap: 10, marginBottom: 10 },
  sttPill:       { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: '#F1F2F6', alignItems: 'center' },
  sttPillActive: { backgroundColor: '#2D3436' },
  sttPillText:   { fontSize: 13, fontWeight: '700', color: '#636E72' },
  sttPillTextActive: { color: 'white' },
  sttDesc:       { fontSize: 11, color: '#A4B0BE', textAlign: 'center' },

  micWrapper:  { position: 'relative', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  roundButton: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center', elevation: 8, zIndex: 2 },
  pulseCircle: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(88, 101, 242, 0.1)', zIndex: 1 },
  activePulse: { backgroundColor: 'rgba(46, 213, 115, 0.2)' },
  btnDisabled: { backgroundColor: '#2D3436' },
  btnActive:   { backgroundColor: '#2ED573' },
  btnSending:  { backgroundColor: '#5865F2' },

  statusHint: { fontSize: 14, color: '#A4B0BE', fontWeight: '700', marginBottom: 40 },

  transcriptContainer: { width: '100%', backgroundColor: '#FFF', padding: 25, borderRadius: 28, minHeight: 120, elevation: 1 },
  transcriptHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  transcriptLabel:     { fontSize: 9, fontWeight: '900', color: '#CED6E0' },
  liveDot:             { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4757' },
  transcriptText:      { fontSize: 18, color: '#2D3436', textAlign: 'center', fontWeight: '500', fontStyle: 'italic' },

  voiceCard:        { width: '100%', backgroundColor: '#FFF', borderRadius: 24, elevation: 3, marginBottom: 30, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, overflow: 'hidden' },
  voiceCardLabel:   { fontSize: 9, fontWeight: '900', color: '#CED6E0', paddingTop: 15, paddingHorizontal: 20 },
  voiceSelector:    { flexDirection: 'row', alignItems: 'center', padding: 15, paddingHorizontal: 20 },
  voiceSelectedName:{ fontSize: 14, fontWeight: '800', color: '#2D3436' },
  voiceSelectedLang:{ fontSize: 11, color: '#A4B0BE', marginTop: 2 },
  voiceChevron:     { fontSize: 12, color: '#A4B0BE', marginLeft: 10 },
  voiceList:        { maxHeight: 220, borderTopWidth: 1, borderTopColor: '#F1F2F6' },
  voiceItem:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20 },
  voiceItemActive:  { backgroundColor: '#F0F3FF' },
  voiceItemName:    { fontSize: 13, color: '#636E72', fontWeight: '600' },
  voiceItemNameActive: { color: '#5865F2' },
  voiceItemLang:    { fontSize: 10, color: '#B2BEC3', marginTop: 1 },
  voiceBadge:       { backgroundColor: '#F1F2F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  voiceBadgeText:   { fontSize: 10, color: '#636E72', fontWeight: '700' },
  voiceSearchInput: { marginHorizontal: 12, marginVertical: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F8F9FD', borderRadius: 12, fontSize: 13, color: '#2D3436', borderWidth: 1, borderColor: '#F1F2F6' },

  chromaEntryBtn:       { backgroundColor: '#00FF00', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, marginBottom: 24 },
  chromaEntryText:      { fontSize: 11, fontWeight: '900', color: '#000', letterSpacing: 1.5 },
  chromaOverlay:        { flex: 1, backgroundColor: '#00FF00', justifyContent: 'center', alignItems: 'center', padding: 40 },
  chromaText:           { fontSize: 64, fontWeight: '900', color: '#000', textAlign: 'center', lineHeight: 80 },
  chromaControls:       { position: 'absolute', top: 20, right: 20, flexDirection: 'row', gap: 10 },
  chromaCtrlBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' },
  chromaCtrlBtnDiscord: { backgroundColor: 'rgba(88,101,242,0.75)' },
  chromaCtrlBtnMic:     { backgroundColor: 'rgba(46,213,115,0.75)' },
  chromaCtrlIcon:       { width: 22, height: 22, resizeMode: 'contain' },
  chromaCtrlClose:      { fontSize: 18, color: '#000', fontWeight: 'bold', lineHeight: 22 },
});
