import { useState, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import { BOT_API_URL } from '@/constants/kiara';

export const useDiscordConnection = () => {
  const [useDiscord, setUseDiscord]     = useState(false);
  const [isCheckingBot, setIsCheckingBot] = useState(false);
  const useDiscordRef = useRef(false);

  useEffect(() => {
    useDiscordRef.current = useDiscord;
  }, [useDiscord]);

  const toggleDiscordMode = async () => {
    if (useDiscord) {
      setUseDiscord(false);
      return;
    }

    setIsCheckingBot(true);
    try {
      const res = await fetch(`${BOT_API_URL}/join-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        setUseDiscord(true);
      } else {
        const msg = await res.text();
        Alert.alert('Discord', msg || 'Kiara no pudo entrar al canal.');
      }
    } catch {
      Alert.alert('Error', 'Servidor Kiara Offline.');
    } finally {
      setIsCheckingBot(false);
    }
  };

  return { useDiscord, setUseDiscord, useDiscordRef, isCheckingBot, toggleDiscordMode };
};
