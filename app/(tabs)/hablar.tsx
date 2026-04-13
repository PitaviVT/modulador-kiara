import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Animated, Easing, Image } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTextToSpeech } from '../functions/text_to_speech'; 
import { useSpeechToText } from '../functions/speech_to_text';

const BOT_API_URL = 'http://192.168.1.10:3000'; 
const DISCORD_LOGO = 'https://cdn.prod.website-files.com/6257adef93867e3ed0344472/6257adef93867e83c634449d_3242075.png'; 

export default function HablarScreen() {
  const [transcript, setTranscript] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [useDiscord, setUseDiscord] = useState(false);
  const [isCheckingBot, setIsCheckingBot] = useState(false);
  
  const useDiscordRef = useRef(false);
  const timeoutRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { voices, selectedVoiceIndex, speak: speakLocal } = useTextToSpeech();

  // --- 1. RECONOCIMIENTO DE VOZ ---
  const { isActive, startRecognition, stopRecognition } = useSpeechToText((text) => {
    if (!text) return;
    setTranscript(text);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    const currentVoice = voices[selectedVoiceIndex]?.name || 'default';

    // IMPORTANTE: Aquí solo enviamos el texto, NO llamamos a join
    if (useDiscordRef.current) {
      sendToDiscord(text, currentVoice);
    } else {
      speakLocal(text);
    }
    timeoutRef.current = setTimeout(() => setTranscript(""), 4000);
  });

  useEffect(() => {
    useDiscordRef.current = useDiscord;
  }, [useDiscord]);

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      ).start();
    } else {
      Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: false }).start();
    }
  }, [isActive]);

  // --- 2. LÓGICA DE CONEXIÓN (click en el logo de Discord → bot entra a tu canal) ---
  const toggleDiscordMode = async () => {
    if (useDiscord) {
      setUseDiscord(false);
      return;
    }

    setIsCheckingBot(true);
    try {
      const joinRes = await fetch(`${BOT_API_URL}/join-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (joinRes.ok) {
        setUseDiscord(true);
      } else {
        const errText = await joinRes.text();
        Alert.alert("Discord", errText || "Kiara no pudo entrar al canal.");
      }
    } catch (error) {
      Alert.alert("Error", "Servidor Kiara Offline.");
    } finally {
      setIsCheckingBot(false);
    }
  };

  // --- 3. ENVÍO DE AUDIO (Solo /speak) ---
  const sendToDiscord = async (text: string, voiceName: string) => {
    if (!text.trim()) return;
    try {
      setIsSending(true);
      const response = await fetch(`${BOT_API_URL}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: voiceName }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn("[DEBUG] El servidor rechazó el mensaje:", errText);
        // Solo desconectar si el bot no está en voz, no por errores de TTS
        if (response.status === 400) setUseDiscord(false);
        return;
      }

      // El servidor devuelve el mismo audio que reprodujo en Discord → lo reproducimos localmente
      const audioBlob = await response.blob();
      const blobUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(blobUrl);
      audio.play();
      audio.onended = () => URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Error en el envío:", error);
      setUseDiscord(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleMic = async () => {
    if (!isActive && !useDiscord) speakLocal(""); 
    try { isActive ? stopRecognition() : startRecognition(); } catch (e) { }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.headerTitle}>KIARA CONTROL</Text>
      <Text style={styles.headerSubtitle}>Hybrid Voice System</Text>
      
      <View style={styles.modeCard}>
        <View style={styles.modeInfo}>
          <TouchableOpacity 
            onPress={toggleDiscordMode}
            disabled={isCheckingBot}
            activeOpacity={0.7}
            style={[
                styles.discordButton, 
                useDiscord ? styles.discordActive : styles.discordInactive
            ]}
          >
            {isCheckingBot ? (
                <ActivityIndicator color={useDiscord ? "white" : "#5865F2"} size="small" />
            ) : (
                <Image 
                    source={{ uri: DISCORD_LOGO }} 
                    style={styles.discordLogo} 
                    tintColor={useDiscord ? undefined : '#A4B0BE'} 
                />
            )}
          </TouchableOpacity>
          <View>
            <Text style={[styles.modeTitle, { color: useDiscord ? "#5865F2" : "#2D3436" }]}>
              {useDiscord ? "Discord Activo" : "Discord Desconectado"}
            </Text>
            <Text style={styles.modeDesc}>
                {isCheckingBot ? "Conectando Kiara..." : "Presiona el logo para entrar"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.micWrapper}>
        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }, isActive && styles.activePulse]} />
        <TouchableOpacity 
          activeOpacity={0.9} 
          style={[styles.roundButton, isActive ? styles.btnActive : styles.btnDisabled, isSending && styles.btnSending]} 
          onPress={handleToggleMic}
          disabled={isSending || isCheckingBot}
        >
          {isSending ? (
             <ActivityIndicator color="white" size="large" />
          ) : (
            <IconSymbol size={42} name={isActive ? "waveform" : "mic.fill"} color="white" />
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.statusHint}>
        {isActive ? "Escuchando voz..." : isSending ? "Kiara está hablando..." : "Presiona para hablar"}
      </Text>

      <View style={styles.transcriptContainer}>
        <View style={styles.transcriptHeader}>
          <Text style={styles.transcriptLabel}>TRANSCRIPCIÓN ACTUAL</Text>
          {isActive && <View style={styles.liveDot} />}
        </View>
        <Text style={styles.transcriptText}>{transcript || "..."}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 30, alignItems: 'center', backgroundColor: '#F8F9FD' },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#1A1A1B', letterSpacing: 1.5 },
  headerSubtitle: { fontSize: 11, color: '#A4B0BE', fontWeight: 'bold', marginBottom: 40, textTransform: 'uppercase' },
  modeCard: { width: '100%', padding: 15, backgroundColor: '#FFF', borderRadius: 24, elevation: 3, marginBottom: 50, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  modeInfo: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  discordButton: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 5 },
  discordActive: { backgroundColor: '#5865F2' },
  discordInactive: { backgroundColor: '#F1F2F6' },
  discordLogo: { width: 38, height: 38, resizeMode: 'contain' },
  modeTitle: { fontWeight: '800', fontSize: 16 },
  modeDesc: { fontSize: 11, color: '#A4B0BE' },
  micWrapper: { position: 'relative', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  roundButton: { width: 110, height: 110, borderRadius: 55, justifyContent: 'center', alignItems: 'center', elevation: 8, zIndex: 2 },
  pulseCircle: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(88, 101, 242, 0.1)', zIndex: 1 },
  activePulse: { backgroundColor: 'rgba(46, 213, 115, 0.2)' },
  btnDisabled: { backgroundColor: '#2D3436' },
  btnActive: { backgroundColor: '#2ED573' },
  btnSending: { backgroundColor: '#5865F2' },
  statusHint: { fontSize: 14, color: '#A4B0BE', fontWeight: '700', marginBottom: 40 },
  transcriptContainer: { width: '100%', backgroundColor: '#FFF', padding: 25, borderRadius: 28, minHeight: 120, elevation: 1 },
  transcriptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  transcriptLabel: { fontSize: 9, fontWeight: '900', color: '#CED6E0' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4757' },
  transcriptText: { fontSize: 18, color: '#2D3436', textAlign: 'center', fontWeight: '500', fontStyle: 'italic' }
});