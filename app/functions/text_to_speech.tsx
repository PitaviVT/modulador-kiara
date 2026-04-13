    import { useState, useEffect, useCallback } from 'react';

    export const useTextToSpeech = () => {
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [selectedVoiceIndex, setSelectedVoiceIndex] = useState<number>(0);
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

    useEffect(() => {
        if (!synth) return;
        const updateVoices = () => {
        setVoices(synth.getVoices());
        };
        if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = updateVoices;
        }
        updateVoices();
    }, [synth]);

    const speak = useCallback((text: string, onEnd?: () => void) => {
        if (!synth) return;
        synth.cancel(); // Detener cualquier audio previo

        const utterance = new SpeechSynthesisUtterance(text);
        const voice = voices[selectedVoiceIndex];
        
        if (voice) utterance.voice = voice;
        utterance.lang = "es-MX";
        
        if (onEnd) utterance.onend = onEnd;
        
        synth.speak(utterance);
    }, [synth, voices, selectedVoiceIndex]);

    return { voices, selectedVoiceIndex, setSelectedVoiceIndex, speak };
    };