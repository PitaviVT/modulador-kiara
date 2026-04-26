import { useState, useRef, useEffect } from 'react';
import { BOT_API_URL } from '@/constants/kiara';

const getMime = () => {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return types.find(t => (window as any).MediaRecorder?.isTypeSupported?.(t)) ?? 'audio/webm';
};

// Sends a recorded audio blob to the Whisper /transcribe endpoint and returns the text.
const transcribeBlob = async (blob: Blob): Promise<string> => {
  if (blob.size < 800) return '';
  const res = await fetch(`${BOT_API_URL}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  if (!res.ok) return '';
  const { text } = await res.json();
  return (text ?? '').trim();
};

export const useServerSTT = (onResult: (text: string) => void) => {
  const [isActive, setIsActive]         = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Keep the latest callback in a ref to avoid stale closure issues
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  const streamRef    = useRef<MediaStream | null>(null);
  const ctxRef       = useRef<AudioContext | null>(null);
  const recRef       = useRef<any>(null);
  const chunksRef    = useRef<BlobPart[]>([]);
  const isActiveRef  = useRef(false);
  const mimeRef      = useRef('audio/webm');
  const silenceTimer = useRef<any>(null);
  const hasSpeech    = useRef(false);
  const inFlight     = useRef(0);

  // Start a new MediaRecorder segment. When stopped it immediately restarts
  // and sends the captured audio to Whisper in the background.
  const startSegment = () => {
    if (!isActiveRef.current || !streamRef.current) return;
    const mime = mimeRef.current;
    const rec  = new (window as any).MediaRecorder(streamRef.current, { mimeType: mime });
    chunksRef.current = [];

    rec.ondataavailable = (e: any) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const saved = [...chunksRef.current];
      chunksRef.current = [];
      hasSpeech.current = false;

      // Restart recording immediately so no audio is lost while we process
      if (isActiveRef.current) startSegment();

      // Transcribe in the background
      const blob = new Blob(saved, { type: mime });
      inFlight.current++;
      setIsProcessing(true);
      transcribeBlob(blob).then(text => {
        if (text) onResultRef.current(text);
      }).finally(() => {
        inFlight.current--;
        if (inFlight.current === 0) setIsProcessing(false);
      });
    };

    recRef.current = rec;
    rec.start(200);
  };

  // Voice Activity Detection: monitors RMS and cuts the segment after 1.2 s of silence.
  const setupVAD = (stream: MediaStream) => {
    const ctx      = new AudioContext();
    ctxRef.current = ctx;
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (!isActiveRef.current) { ctx.close(); return; }
      analyser.getByteTimeDomainData(data);
      // RMS of the time-domain signal (128 = silence)
      const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) ** 2, 0) / data.length);

      if (rms > 6) {
        hasSpeech.current = true;
        clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
      } else if (hasSpeech.current && !silenceTimer.current) {
        silenceTimer.current = setTimeout(() => {
          silenceTimer.current = null;
          if (recRef.current?.state === 'recording') recRef.current.stop();
        }, 1200);
      }
      requestAnimationFrame(tick);
    };
    tick();
  };

  const startRecognition = async () => {
    if (isActiveRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current   = getMime();
      isActiveRef.current = true;
      setIsActive(true);
      setupVAD(stream);
      startSegment();
    } catch (err) {
      console.error('useServerSTT: could not start', err);
    }
  };

  const stopRecognition = () => {
    isActiveRef.current = false;
    setIsActive(false);
    clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    try { recRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
  };

  return { isActive, isProcessing, startRecognition, stopRecognition };
};
