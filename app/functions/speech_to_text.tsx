import { useState, useRef, useCallback } from 'react';

interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const { webkitSpeechRecognition, SpeechRecognition } = (typeof window !== 'undefined' ? window : {}) as IWindow;
const SpeechRecognitionAPI = SpeechRecognition || webkitSpeechRecognition;

const RMS_THRESHOLD = 8;   // ~6% de amplitud — se activa con voz normal
const ONSET_FRAMES  = 4;   // frames consecutivos antes de lanzar sesión (~66ms a 60fps)

export const useSpeechToText = (onResult: (text: string) => void) => {
  const [isActive, setIsActive] = useState(false);
  const isActiveRef    = useRef(false);
  const recognitionRef = useRef<any>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const ctxRef         = useRef<AudioContext | null>(null);
  const recognizingRef = useRef(false);
  const onResultRef    = useRef(onResult);
  onResultRef.current  = onResult;

  const stopRecognition = useCallback(() => {
    isActiveRef.current    = false;
    recognizingRef.current = false;
    setIsActive(false);

    if (recognitionRef.current) {
      recognitionRef.current.onend    = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror  = null;
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }

    ctxRef.current?.close();
    ctxRef.current = null;

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startRecognition = useCallback(async () => {
    if (!SpeechRecognitionAPI) return alert("Navegador no compatible");
    if (isActiveRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch (err) {
      console.error("Error acceso micro:", err);
      return;
    }

    isActiveRef.current = true;
    setIsActive(true);

    // VAD: mide RMS del micrófono, solo abre sesión cuando hay voz real
    const ctx      = new AudioContext();
    ctxRef.current = ctx;
    const source   = ctx.createMediaStreamSource(streamRef.current!);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data     = new Uint8Array(analyser.frequencyBinCount);
    let onsetCount = 0;

    const launchSession = () => {
      if (!isActiveRef.current || recognizingRef.current) return;
      recognizingRef.current = true;
      console.log('[STT] sesión iniciada');

      const recognition = new SpeechRecognitionAPI();
      recognition.lang           = "es-MX";
      recognition.continuous     = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            console.log('[STT] resultado:', event.results[i][0].transcript);
            onResultRef.current(event.results[i][0].transcript);
            try { recognition.stop(); } catch (_) {}
          }
        }
      };

      recognition.onend = () => {
        console.log('[STT] sesión terminada — esperando VAD');
        recognizingRef.current = false;
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stopRecognition();
        }
        // network/no-speech: onend resetea recognizingRef, VAD reintenta al hablar
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (e) {
        console.error('[STT] start() falló:', e);
        recognizingRef.current = false;
      }
    };

    const tick = () => {
      if (!isActiveRef.current) { ctx.close(); return; }
      analyser.getByteTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) ** 2, 0) / data.length);

      if (rms > RMS_THRESHOLD) {
        onsetCount++;
        if (onsetCount >= ONSET_FRAMES) {
          onsetCount = 0;
          launchSession();
        }
      } else {
        onsetCount = 0;
      }
      requestAnimationFrame(tick);
    };
    tick();

  }, [stopRecognition]);

  return { isActive, startRecognition, stopRecognition };
};
