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
import { deviceContext } from './errors';
import type {
  Account,
  ClientMessage,
  GameView,
  MatchSummary,
  PlayerInfo,
  PlayerStats,
  Promotion,
  ReportKind,
  ServerMessage,
} from './shared/protocol';
import {
  SavedSession,
  clearAuthToken,
  clearSession,
  saveAuthToken,
  saveSession,
} from './storage';

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
  const [lastReportId, setLastReportId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  // Нэр дээр дарж нээсэн тоглогчийн мэдээлэл.
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null);
  // Цол ахисны ёслол — нэг дор нэг л ёслол харуулна.
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [profile, setProfile] = useState<{ stats: PlayerStats; matches: MatchSummary[] } | null>(
    null,
  );
  const authTokenRef = useRef<string | null>(null);

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
      case 'auth':
        setAccount(msg.account);
        if (msg.token) {
          authTokenRef.current = msg.token;
          void saveAuthToken(msg.token);
        }
        if (!msg.account) {
          authTokenRef.current = null;
          setProfile(null);
          void clearAuthToken();
        }
        break;
      case 'profile':
        setProfile({ stats: msg.stats, matches: msg.matches });
        break;
      case 'playerInfo':
        setPlayerInfo(msg.info);
        break;
      case 'celebrate':
        setPromotion(msg.promotion);
        break;
      case 'notice':
        setNotice(msg.message);
        break;
      case 'reported':
        setLastReportId(msg.id);
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
      // Нэвтрэлт нь холболт тус бүрд дахин батлагдах ёстой — сервер сокет
      // бүрийн хэрэглэгчийг тусад нь санадаг. Эс бөгөөс дахин холбогдсоны
      // дараа профайл, түүх ажиллахгүй.
      if (authTokenRef.current) {
        rawSend(ws, { t: 'authResume', token: authTokenRef.current });
      }
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
    lastReportId,
    notice,
    clearNotice: () => setNotice(null),
    account,
    profile,
    playerInfo,
    promotion,
    clearPromotion: useCallback(() => setPromotion(null), []),
    closePlayerInfo: useCallback(() => setPlayerInfo(null), []),
    clearError: useCallback(() => setError(null), []),

    register: useCallback(
      (username: string, password: string, email: string) =>
        send({ t: 'register', username, password, email }),
      [send],
    ),
    logIn: useCallback(
      (username: string, password: string) => send({ t: 'login', username, password }),
      [send],
    ),
    /** Нууц үг мартсан — имэйл рүү код илгээнэ. */
    forgotPassword: useCallback((email: string) => send({ t: 'forgotPassword', email }), [send]),
    resetPassword: useCallback(
      (email: string, code: string, password: string) =>
        send({ t: 'resetPassword', email, code, password }),
      [send],
    ),
    /** Хадгалсан token-оор нэвтрэлтээ сэргээх. */
    resumeAuth: useCallback(
      (token: string) => {
        authTokenRef.current = token;
        send({ t: 'authResume', token });
      },
      [send],
    ),
    logOut: useCallback(() => send({ t: 'logout', token: authTokenRef.current ?? '' }), [send]),
    loadProfile: useCallback(() => send({ t: 'profile' }), [send]),
    /** Профайлын зураг тохируулах. */
    setAvatar: useCallback((avatar: string | null) => send({ t: 'setAvatar', avatar }), [send]),
    /** Өөр тоглогчийн ил мэдээллийг асуух. */
    inspectPlayer: useCallback(
      (playerId: string) => {
        setPlayerInfo(null);
        send({ t: 'inspect', playerId });
      },
      [send],
    ),
    /** Имэйл рүү ирсэн кодыг шалгуулах. */
    verifyEmail: useCallback((code: string) => send({ t: 'verifyEmail', code }), [send]),
    resendCode: useCallback(() => send({ t: 'resendCode' }), [send]),
    /** Токен дуусахад админаас хүсэх. */
    requestTokens: useCallback(() => send({ t: 'requestTokens' }), [send]),

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
    /** Алдааны мэдэгдэл илгээх. Орчны мэдээллийг өөрөө хавсаргана. */
    sendReport: useCallback(
      (kind: ReportKind, text: string, context: Record<string, unknown> = {}) =>
        send({ t: 'report', kind, text, context: { ...deviceContext(), ...context } }),
      [send],
    ),
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
