/**
 * Сервертэй холбогдох WebSocket клиент.
 *
 * Гол зарчим: холболт тасарвал өрөөнөөс шууд хөөгдөхгүй — хадгалсан
 * `session` ашиглан суудлаа автоматаар эргүүлэн авахыг оролдоно.
 */

import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { Card } from './shared/cards';
import type { ClientMessage, GameView, ServerMessage } from './shared/protocol';
import { SavedSession, clearSession, saveSession } from './storage';

export const SERVER_PORT = 8787;
const MAX_RECONNECT_ATTEMPTS = 6;

/**
 * Expo dev сервер ажиллаж буй машины IP-г ашиглан анхдагч хаягийг таана.
 * Ингэснээр жинхэнэ утаснаас туршихад гараар IP бичих шаардлагагүй.
 */
export function defaultServerUrl(): string {
  // Вэб хувилбар нь ихэвчлэн серверээсээ өөрөө үйлчлүүлдэг тул ижил хаяг руу
  // холбогдоно. Expo dev сервер (8081 порт) дээр байвал тоглоомын порт руу заана.
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    if (location.port === '8081') return `ws://${location.hostname}:${SERVER_PORT}`;
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
      ?.debuggerHost;
  const host = hostUri?.split(':')[0];
  return `ws://${host || 'localhost'}:${SERVER_PORT}`;
}

export type ConnectionStatus = 'offline' | 'connecting' | 'online';

export interface ChatLine {
  from: string;
  at: number;
  /** Бичвэр мессеж. */
  text?: string;
  /** Дуут мессеж — data URL. */
  audio?: string;
  /** Дуут мессежийн урт (ms). */
  ms?: number;
}

export function useBigTwo(serverUrl: string) {
  const [status, setStatus] = useState<ConnectionStatus>('offline');
  const [view, setView] = useState<GameView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<SavedSession | null>(null);
  const queueRef = useRef<ClientMessage[]>([]);
  const resumingRef = useRef(false);
  const attemptsRef = useRef(0);
  const wantOnlineRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlRef = useRef(serverUrl);
  urlRef.current = serverUrl;

  const rawSend = (ws: WebSocket, msg: ClientMessage) => ws.send(JSON.stringify(msg));

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.t) {
      case 'joined':
        sessionRef.current = { code: msg.code, playerId: msg.playerId, token: msg.token };
        void saveSession(sessionRef.current);
        setError(null);
        break;
      case 'state':
        resumingRef.current = false;
        setView(msg.view);
        break;
      case 'chat':
        setChat((prev) => [...prev.slice(-49), { from: msg.from, text: msg.text, at: msg.at }]);
        break;
      case 'voice':
        setChat((prev) => [
          ...prev.slice(-49),
          { from: msg.from, audio: msg.data, ms: msg.ms, at: msg.at },
        ]);
        break;
      case 'error':
        setError(msg.message);
        // Суудлаа сэргээж чадаагүй бол хадгалсан session хүчингүй болсон гэсэн үг.
        if (resumingRef.current) {
          resumingRef.current = false;
          sessionRef.current = null;
          wantOnlineRef.current = false;
          void clearSession();
          setView(null);
        }
        break;
    }
  }, []);

  const openSocket = useCallback(() => {
    if (socketRef.current) return;
    wantOnlineRef.current = true;
    setStatus('connecting');

    const ws = new WebSocket(urlRef.current);
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('online');
      attemptsRef.current = 0;
      if (sessionRef.current) {
        resumingRef.current = true;
        rawSend(ws, { t: 'resume', ...sessionRef.current });
      }
      for (const queued of queueRef.current) rawSend(ws, queued);
      queueRef.current = [];
    };

    ws.onmessage = (event) => {
      try {
        handleMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        // Танихгүй мессежийг үл тоомсорлоно.
      }
    };

    ws.onerror = () => setError('Сервертэй холбогдож чадсангүй. Хаягаа шалгана уу.');

    ws.onclose = () => {
      socketRef.current = null;
      setStatus('offline');
      if (wantOnlineRef.current && sessionRef.current) scheduleReconnect();
    };
  }, [handleMessage]);

  const scheduleReconnect = useCallback(() => {
    if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setError('Холболт сэргэсэнгүй. Дахин оролдоно уу.');
      return;
    }
    const delay = Math.min(1000 * 2 ** attemptsRef.current, 10000);
    attemptsRef.current += 1;
    timerRef.current = setTimeout(() => openSocket(), delay);
  }, [openSocket]);

  const send = useCallback(
    (msg: ClientMessage) => {
      const ws = socketRef.current;
      if (ws && ws.readyState === 1) rawSend(ws, msg);
      else {
        queueRef.current.push(msg);
        openSocket();
      }
    },
    [openSocket],
  );

  const disconnect = useCallback(() => {
    wantOnlineRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    socketRef.current?.close();
    socketRef.current = null;
    setStatus('offline');
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return {
    status,
    view,
    error,
    chat,
    clearError: useCallback(() => setError(null), []),

    createRoom: useCallback((name: string) => send({ t: 'create', name }), [send]),
    joinRoom: useCallback(
      (name: string, code: string) => send({ t: 'join', name, code: code.trim().toUpperCase() }),
      [send],
    ),
    /** Хадгалсан суудлаа сэргээх (апп дахин нээгдэхэд). */
    resumeSession: useCallback(
      (session: SavedSession) => {
        sessionRef.current = session;
        openSocket();
      },
      [openSocket],
    ),
    /** Шинэ тоглолт эхлүүлэх (босго оноотой). */
    startGame: useCallback(
      (targetScore: number, turnSeconds: number, stake: number) =>
        send({ t: 'start', targetScore, turnSeconds, stake }),
      [send],
    ),
    /** Дараагийн тойргийг эхлүүлэх. */
    nextRound: useCallback(() => send({ t: 'next' }), [send]),
    playCards: useCallback((cards: Card[]) => send({ t: 'play', cards }), [send]),
    passTurn: useCallback(() => send({ t: 'pass' }), [send]),
    sendChat: useCallback((text: string) => send({ t: 'chat', text }), [send]),
    sendVoice: useCallback(
      (data: string, ms: number) => send({ t: 'voice', data, ms }),
      [send],
    ),
    leaveRoom: useCallback(() => {
      send({ t: 'leave' });
      sessionRef.current = null;
      void clearSession();
      setView(null);
      setChat([]);
      disconnect();
    }, [send, disconnect]),
  };
}
