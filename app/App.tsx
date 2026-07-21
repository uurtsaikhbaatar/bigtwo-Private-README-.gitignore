import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ChatButton } from './src/components/ChatPanel';
import { clearRoomCodeFromUrl, pendingRoomCode } from './src/deeplink';
import { defaultServerUrl, useBigTwo } from './src/net';
import { HomeScreen } from './src/screens/HomeScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { TableScreen } from './src/screens/TableScreen';
import { loadName, loadServer, loadSession, saveName, saveServer } from './src/storage';
import { theme } from './src/theme';

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
  const { resumeSession, joinRoom, clearError, error } = game;
  const startedRef = useRef(false);

  // Апп нээгдэхэд өмнөх нэр, серверийн хаяг, суудлыг сэргээнэ.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [savedName, savedServer, session] = await Promise.all([
        loadName(),
        loadServer(),
        loadSession(),
      ]);
      if (cancelled || startedRef.current) return;
      startedRef.current = true;

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
  }, [resumeSession, joinRoom]);

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

  // Алдааны мэдэгдлийг хэсэг хугацааны дараа автоматаар нуух.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 4000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

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
        />
      ) : view.phase === 'lobby' ? (
        <LobbyScreen view={view} onStart={game.startGame} onLeave={game.leaveRoom} />
      ) : (
        <TableScreen
          view={view}
          onPlay={game.playCards}
          onPass={game.passTurn}
          onNextRound={game.nextRound}
          onNewMatch={() => game.startGame(view.targetScore)}
          onLeave={game.leaveRoom}
        />
      )}

      {view && (
        <ChatButton
          lines={game.chat}
          youName={view.players.find((p) => p.id === view.youId)?.name ?? ''}
          onSend={game.sendChat}
        />
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
  bannerText: { color: theme.text, fontSize: 14, textAlign: 'center', fontWeight: '600' },
});
