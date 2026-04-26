import { useState, useRef, useCallback } from 'react';

interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const { webkitSpeechRecognition, SpeechRecognition } = (typeof window !== 'undefined' ? window : {}) as IWindow;
const SpeechRecognitionAPI = SpeechRecognition || webkitSpeechRecognition;

export const useSpeechToText = (onResult: (text: string) => void) => {
  const [isActive, setIsActive] = useState(false);
  const isActiveRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopRecognition = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.onstart = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
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

    // Crea una nueva instancia en cada sesión.
    // Opera no permite reusar el mismo objeto SpeechRecognition tras onend.
    const launchSession = () => {
      if (!isActiveRef.current) return;

      const recognition = new SpeechRecognitionAPI();
      recognition.lang = "es-MX";
      recognition.continuous = false; // false es más estable en Opera/Edge
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const last = event.results[event.results.length - 1];
        if (last.isFinal) onResult(last[0].transcript);
      };

      recognition.onend = () => {
        // Reiniciar con instancia nueva en lugar de .start() sobre la misma
        if (isActiveRef.current) {
          setTimeout(launchSession, 150);
        } else {
          setIsActive(false);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Error Speech:", event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stopRecognition();
        }
        // Para el resto (network, no-speech, aborted) onend se encarga del reinicio
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (e) {
        console.error("recognition.start() falló:", e);
        if (isActiveRef.current) setTimeout(launchSession, 500);
      }
    };

    launchSession();
  }, [onResult, stopRecognition]);

  return { isActive, startRecognition, stopRecognition };
};
