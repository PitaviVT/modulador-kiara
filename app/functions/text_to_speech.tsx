import { useState, useEffect, useCallback } from 'react';

export const useTextToSpeech = () => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState<number>(0);
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  useEffect(() => {
    if (!synth) return;
    const updateVoices = () => {
      const v = synth.getVoices();
      setVoices(v);
      // Auto-seleccionar Sofia como voz predeterminada
      const sofiaIdx = v.findIndex(voice => voice.name.toLowerCase().includes('sofia'));
      if (sofiaIdx >= 0) setSelectedVoiceIndex(sofiaIdx);
    };
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = updateVoices;
    updateVoices();
  }, [synth]);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synth) return;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices[selectedVoiceIndex];

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'es-MX';
    }

    if (onEnd) utterance.onend = onEnd;
    synth.speak(utterance);
  }, [synth, voices, selectedVoiceIndex]);

  return { voices, selectedVoiceIndex, setSelectedVoiceIndex, speak };
};
