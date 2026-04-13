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
    setIsActive(false);
    isActiveRef.current = false;
    
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecognition = useCallback(async () => {
    if (!SpeechRecognitionAPI) return alert("Navegador no compatible");

    try {
      // Forzar permiso en Opera
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      setTimeout(() => {
        const recognition = new SpeechRecognitionAPI();
        recognition.lang = "es-MX";
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.onstart = () => {
            console.log("Reconocimiento iniciado");
            setIsActive(true); // Esto debe cambiar el estado
            isActiveRef.current = true;
            };

            recognition.onend = () => {
            console.log("Reconocimiento finalizado");
            if (isActiveRef.current) {
                try { 
                recognition.start(); 
                } catch (e) {
                // Si falla al reiniciar, aseguramos que el estado visual sea correcto
                setIsActive(false);
                isActiveRef.current = false;
                }
            } else {
                setIsActive(false);
            }
        };

        recognition.onresult = (event: any) => {
          const text = event.results[event.results.length - 1][0].transcript;
          if (event.results[event.results.length - 1].isFinal) {
            onResult(text);
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Error Speech:", event.error);
          if (event.error === 'not-allowed') stopRecognition();
        };
        
        recognitionRef.current = recognition;
        recognition.start();
      }, 600);
    } catch (err) {
      console.error("Error acceso micro:", err);
      setIsActive(false);
    }
  }, [onResult, stopRecognition]);

  return { isActive, startRecognition, stopRecognition };
};