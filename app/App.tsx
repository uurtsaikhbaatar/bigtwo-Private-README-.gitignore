import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ChatButton } from './src/components/ChatPanel';
import { PlayerInfoPanel } from './src/components/PlayerInfoPanel';
import { ReportButton } from './src/components/ReportButton';
import { clearRoomCodeFromUrl, pendingRoomCode } from './src/deeplink';
import { installErrorReporter } from './src/errors';
import { defaultServerUrl, useBigTwo } from './src/net';
import { HomeScreen } from './src/screens/HomeScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { TableScreen } from './src/screens/TableScreen';
import {
  loadAuthToken,
  loadName,
  loadServer,
  loadSession,
  saveName,
  saveServer,
} from './src/storage';
import type { GameView } from './src/shared/protocol';
import { theme } from './src/theme';

/** Мэдэгдэлд хавсаргах товч төлөв — бүтэн харагдац хэт том тул. */
function summarise(view: GameView) {
  return {
    code: view.code,
    phase: view.phase,
    round: view.round,
    turnIsYou: view.turnId === view.youId,
    seated: view.youAreSeated,
    handCount: view.yourHand.length,
    players: view.players.map((p) => `${p.name}:${p.score}`),
    log: view.log.slice(-5),
  };
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState(defaultServerUrl());
  const [invitedCode, setInvitedCode] = useState('');
  const game = useBigTwo(serverUrl);
  const { resumeSession, joinRoom, resumeAuth, clearError, error } = game;
  const startedRef = useRef(false);

  // Апп нээгдэхэд өмнөх нэр, серверийн хаяг, суудлыг сэргээнэ.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [savedName, savedServer, session, authToken] = await Promise.all([
        loadName(),
        loadServer(),
        loadSession(),
        loadAuthToken(),
      ]);
      if (cancelled || startedRef.current) return;
      startedRef.current = true;

      if (authToken) resumeAuth(authToken);
      if (savedName) setName(savedName);
      if (savedServer) setServerUrl(savedServer);

      const invited = pendingRoomCode();
      if (session) {
        // Идэвхтэй суудал байвал тэр нь линкээс давуу.
        resumeSession(session);
      } else if (invited) {
        // Кодыг үргэлж бэлдэнэ — нэгдэх оролдлого бүтэлгүйтвэл (өрөө дууссан,
        // тоглоом эхэлчихсэн) хэрэглэгч нүүр хуудсанд тайлбартай үлдэнэ.
        setInvitedCode(invited);
        // Нэрээ мэддэг бол товч дарах шаардлагагүй — шууд оруулна.
        if (savedName?.trim()) joinRoom(savedName, invited);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeSession, joinRoom, resumeAuth]);

  // Аппад гарсан алдааг автоматаар мэдэгдэнэ.
  const { sendReport } = game;
  useEffect(() => installErrorReporter(sendReport), [sendReport]);

  // Нэвтэрсэн бол тоглогчийн нэрийг бүртгэлийн нэртэй нийцүүлнэ.
  const accountName = game.account?.username;
  useEffect(() => {
    if (accountName) setName(accountName);
  }, [accountName]);

  // Өрөөнд орсны дараа хаягийг цэвэрлэнэ.
  useEffect(() => {
    if (game.view) clearRoomCodeFromUrl();
  }, [game.view]);

  // Хэрэглэгчийн оруулсан утгыг тогтмол хадгална.
  useEffect(() => {
    if (ready && name) void saveName(name);
  }, [ready, name]);
  useEffect(() => {
    if (ready && serverUrl) void saveServer(serverUrl);
  }, [ready, serverUrl]);

  // Мэдээллийн мессежийг ч мөн адил түр харуулна.
  useEffect(() => {
    if (!game.notice) return;
    const timer = setTimeout(game.clearNotice, 5000);
    return () => clearTimeout(timer);
  }, [game.notice, game.clearNotice]);

  // Алдааны мэдэгдлийг хэсэг хугацааны дараа автоматаар нуух.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 4000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  // Нэр дээр дарж нээсэн тоглогч. Хариу ирэхээс өмнө нэрийг нь харуулна.
  const [inspecting, setInspecting] = useState<string | null>(null);
  const closeInspect = () => {
    setInspecting(null);
    game.closePlayerInfo();
  };

  const view = game.view;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      ) : !view ? (
        <HomeScreen
          name={name}
          onNameChange={setName}
          serverUrl={serverUrl}
          onServerUrlChange={setServerUrl}
          onCreate={() => game.createRoom(name)}
          onJoin={(code) => game.joinRoom(name, code)}
          connecting={game.status === 'connecting'}
          initialCode={invitedCode}
          auth={{
            account: game.account,
            profile: game.profile,
            onRegister: game.register,
            onLogin: game.logIn,
            onLogout: game.logOut,
            onLoadProfile: game.loadProfile,
            onVerifyEmail: game.verifyEmail,
            onResendCode: game.resendCode,
            onRequestTokens: game.requestTokens,
          }}
        />
      ) : view.phase === 'lobby' ? (
        <LobbyScreen view={view} onStart={game.startGame} onLeave={game.leaveRoom} />
      ) : (
        <TableScreen
          view={view}
          onPlay={game.playCards}
          onPass={game.passTurn}
          onNextRound={game.nextRound}
          onNewMatch={() => game.startGame(view.targetScore, view.turnSeconds, view.stake)}
          onLeave={game.leaveRoom}
          onInspect={(playerId, name) => {
            setInspecting(name);
            game.inspectPlayer(playerId);
          }}
        />
      )}

      {view && (
        <>
          <ChatButton
            lines={game.chat}
            youName={view.players.find((p) => p.id === view.youId)?.name ?? ''}
            onSend={game.sendChat}
            onSendVoice={game.sendVoice}
          />
          <PlayerInfoPanel
            pendingName={inspecting}
            info={game.playerInfo}
            onClose={closeInspect}
          />
          <ReportButton
            lastReportId={game.lastReportId}
            onSend={(text) => game.sendReport('bug', text, { view: summarise(view) })}
          />
        </>
      )}

      {game.status !== 'online' && view && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {game.status === 'connecting' ? 'Холбогдож байна…' : 'Холболт тасарлаа'}
          </Text>
        </View>
      )}
      {error && (
        <View style={[styles.banner, styles.errorBanner]}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      )}
      {game.notice && !error && (
        <View style={[styles.banner, styles.noticeBanner]}>
          <Text style={styles.bannerText}>{game.notice}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a1a2c' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: theme.surfaceRaised,
    borderRadius: theme.radius,
    padding: 12,
  },
  errorBanner: { backgroundColor: theme.danger },
  noticeBanner: { backgroundColor: '#1d7a52' },
  bannerText: { color: theme.text, fontSize: 14, textAlign: 'center', fontWeight: '600' },
});
