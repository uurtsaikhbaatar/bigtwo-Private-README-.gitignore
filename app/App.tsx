import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ChatButton } from './src/components/ChatPanel';
import { Celebration } from './src/components/Celebration';
import { WinCelebration } from './src/components/WinCelebration';
import { HelpButton } from './src/components/HelpButton';
import { PlayerInfoPanel } from './src/components/PlayerInfoPanel';
import { SoundToggle } from './src/components/SoundToggle';
import { ReportButton } from './src/components/ReportButton';
import { clearRoomCodeFromUrl, pendingRoomCode, pendingWatchCode } from './src/deeplink';
import { installErrorReporter } from './src/errors';
import { defaultServerUrl, useBigTwo } from './src/net';
import { DrawScreen } from './src/screens/DrawScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { PokerScreen } from './src/screens/PokerScreen';
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
  // Зочноор тоглохыг сонгосон эсэх. Апп нээлттэй байх хугацаанд хадгалагдана
  // (өрөө орж гарахад дахин гейт харагдахгүй), гэхдээ хадгалалтад бичихгүй —
  // дахин нээхэд эхлэх сонголтоо дахин харна.
  const [guestChosen, setGuestChosen] = useState(false);
  // Хадгалсан токеноор нэвтрэлт сэргээж байх зуур гейт анивчихаас сэргийлнэ.
  const [authPending, setAuthPending] = useState(false);
  // Хожлын баяр — хожигч сүүлийн хөзрөө тавихад дэлгэц дүүрэн түүз, тамга.
  const [winCeleb, setWinCeleb] = useState<{ name: string; mine: boolean; match: boolean } | null>(
    null,
  );
  const celebratedRoundRef = useRef(-1);
  const game = useBigTwo(serverUrl);
  const { resumeSession, joinRoom, resumeAuth, clearError, error, watchRoom } = game;
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

      if (authToken) {
        setAuthPending(true);
        resumeAuth(authToken);
      }
      if (savedName) setName(savedName);
      if (savedServer) setServerUrl(savedServer);

      const watching = pendingWatchCode();
      const invited = pendingRoomCode();
      if (watching) {
        // ҮЗЭГЧийн линк бүх зүйлээс давуу — линк дарсан хүн харахыг хүсэж байна.
        watchRoom(savedName ?? '', watching);
      } else if (session) {
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
  }, [resumeSession, joinRoom, resumeAuth, watchRoom]);

  // Аппад гарсан алдааг автоматаар мэдэгдэнэ.
  const { sendReport } = game;
  useEffect(() => installErrorReporter(sendReport), [sendReport]);

  // Нэвтэрсэн бол тоглогчийн нэрийг бүртгэлийн нэртэй нийцүүлнэ.
  const accountName = game.account?.username;
  useEffect(() => {
    if (accountName) setName(accountName);
  }, [accountName]);

  // Нэвтрэлт сэргээж дуусмагц (эсвэл токен хүчингүй бол хамгаалалтын хугацааны
  // дараа) гейтийг нээнэ. Ингэснээр нэвтэрсэн хэрэглэгч гейт харалгүй шууд орно.
  useEffect(() => {
    if (game.account) {
      setAuthPending(false);
      return;
    }
    if (!authPending) return;
    const timer = setTimeout(() => setAuthPending(false), 4000);
    return () => clearTimeout(timer);
  }, [game.account, authPending]);

  // Нэвтэрмэгц урилгуудаа татна. Сервер шинэ урилга ирэхэд өөрөө илгээх ч
  // апп дахин нээгдэхэд нэг удаа асуух хэрэгтэй.
  const accountId = game.account?.id ?? null;
  const loadInvites = game.loadInvites;
  useEffect(() => {
    if (accountId) loadInvites();
  }, [accountId, loadInvites]);
  // Өрөөнд орсны дараа рекламыг нэг удаа татна.
  const inRoom = Boolean(game.view || game.pokerView);
  const loadAds = game.loadAds;
  useEffect(() => {
    if (inRoom) loadAds();
  }, [inRoom, loadAds]);

  // Өрөөнд орсны дараа хаягийг цэвэрлэнэ.
  useEffect(() => {
    if (game.view || game.pokerView) clearRoomCodeFromUrl();
  }, [game.view, game.pokerView]);

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

  // Нэвтрэлтийн самбарын бүх дамжуулга — нүүр ба лобби хоёуланд хэрэгтэй.
  const authProps = {
    account: game.account,
    profile: game.profile,
    onRegister: game.register,
    onLogin: game.logIn,
    onLogout: () => {
      game.logOut();
      // Гарсны дараа эхлэх сонголт руу буцаана — зочин байдлыг ч цэвэрлэнэ.
      setGuestChosen(false);
    },
    onLoadProfile: game.loadProfile,
    onVerifyEmail: game.verifyEmail,
    onResendCode: game.resendCode,
    onRequestTokens: game.requestTokens,
    onTransferTokens: game.transferTokens,
    onSetAvatar: game.setAvatar,
    onForgotPassword: game.forgotPassword,
    onResetPassword: game.resetPassword,
  };

  const view = game.view;
  const pv = game.pokerView;
  // Покер эсвэл Big Two — өрөөнд байгаа эсэх, таны id, нэр.
  const youId = view?.youId ?? pv?.youId ?? '';
  const youName =
    view?.players.find((p) => p.id === view.youId)?.name ??
    pv?.players.find((p) => p.id === pv.youId)?.name ??
    '';
  const youRankWins =
    view?.players.find((p) => p.id === view.youId)?.rankedWins ??
    pv?.players.find((p) => p.id === pv.youId)?.rankedWins ??
    null;

  // Покерын Sit & Go дуусахад нэг удаа хожлын баяр.
  const pokerCelebratedRef = useRef('');
  useEffect(() => {
    if (!pv || pv.phase !== 'finished' || !pv.winnerId) return;
    const key = `${pv.code}#${pv.handNo}`;
    if (pokerCelebratedRef.current === key) return;
    pokerCelebratedRef.current = key;
    const w = pv.players.find((p) => p.id === pv.winnerId);
    if (w) setWinCeleb({ name: w.name, mine: w.id === pv.youId, match: true });
  }, [pv?.phase, pv?.winnerId, pv?.handNo, pv?.code]);

  // Тойрог/тоглолт дуусч хожигч тодрох мөчид нэг л удаа хожлын баяр асаана.
  useEffect(() => {
    if (!view) {
      celebratedRoundRef.current = -1;
      return;
    }
    const ended = view.phase === 'roundEnd' || view.phase === 'matchEnd';
    if (!ended || view.round === celebratedRoundRef.current) return;
    celebratedRoundRef.current = view.round;
    const winner =
      view.players.find((p) => p.place === 1) ??
      view.players.find((p) => p.id === view.matchWinnerId);
    if (winner) {
      setWinCeleb({
        name: winner.name,
        mine: winner.id === view.youId,
        match: view.phase === 'matchEnd',
      });
    }
  }, [view?.phase, view?.round, view?.matchWinnerId]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      {!ready || (authPending && !view && !pv) ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      ) : pv ? (
        <PokerScreen
          view={pv}
          account={game.account}
          onAct={game.pokerAct}
          onStart={game.pokerStart}
          onBlinds={game.pokerBlinds}
          onBuyIn={game.pokerBuyIn}
          onSitIn={game.pokerSitIn}
          onAddBot={game.addBot}
          onRemoveBot={game.removeBot}
          onLeave={pv.spectating ? game.stopWatching : game.leaveRoom}
          onInvite={game.invitePlayers}
          onInspect={(playerId, name) => {
            setInspecting(name);
            game.inspectPlayer(playerId);
          }}
        />
      ) : !view ? (
        <HomeScreen
          name={name}
          onNameChange={setName}
          serverUrl={serverUrl}
          onServerUrlChange={setServerUrl}
          onCreate={(g, f) => game.createRoom(name, g, f)}
          onJoin={(code) => game.joinRoom(name, code)}
          connecting={game.status === 'connecting'}
          initialCode={invitedCode}
          invites={game.invites}
          onAcceptInvite={(roomCode) => game.joinRoom(name, roomCode)}
          onDeclineInvite={game.declineInvite}
          onDismissInvite={() => {
            setInvitedCode('');
            clearRoomCodeFromUrl();
          }}
          auth={authProps}
          guestReady={guestChosen}
          onEnterGuest={() => setGuestChosen(true)}
          leaderboard={game.leaderboard}
          leaderboardGame={game.leaderboardGame}
          onLoadLeaderboard={game.loadLeaderboard}
        />
      ) : view.spectating ? (
        <TableScreen
          view={view}
          spectating
          onPlay={game.playCards}
          onPass={game.passTurn}
          onNextRound={game.nextRound}
          onNewMatch={() => undefined}
          onLeave={game.stopWatching}
          onInspect={(playerId, name) => {
            setInspecting(name);
            game.inspectPlayer(playerId);
          }}
          onInvite={() => undefined}
          invites={[]}
          onAcceptInvite={() => undefined}
          onDeclineInvite={() => undefined}
          ads={game.ads}
          httpBase={game.httpBase}
          onAdEvent={game.adEvent}
        />
      ) : view.phase === 'lobby' ? (
        <LobbyScreen
          view={view}
          onStart={game.startGame}
          onLeave={game.leaveRoom}
          auth={authProps}
          onAddBot={game.addBot}
          onRemoveBot={game.removeBot}
          ads={game.ads}
          httpBase={game.httpBase}
          onAdEvent={game.adEvent}
        />
      ) : view.phase === 'drawing' ? (
        <DrawScreen view={view} onPick={game.pickDraw} />
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
          onInvite={game.invitePlayers}
          invites={game.invites}
          onAcceptInvite={(roomCode) => game.joinRoom(name, roomCode)}
          onDeclineInvite={game.declineInvite}
          ads={game.ads}
          httpBase={game.httpBase}
          onAdEvent={game.adEvent}
        />
      )}

      {(view || pv) && game.promotion && (
        <Celebration
          promotion={game.promotion}
          mine={game.promotion.playerId === youId}
          onDone={game.clearPromotion}
        />
      )}

      {winCeleb && (
        <WinCelebration
          name={winCeleb.name}
          mine={winCeleb.mine}
          match={winCeleb.match}
          onDone={() => setWinCeleb(null)}
        />
      )}

      {(view || pv) && (
        <>
          <ChatButton
            lines={game.chat}
            youName={youName}
            onSend={game.sendChat}
            onSendVoice={game.sendVoice}
          />
          <SoundToggle />
          <HelpButton wins={youRankWins} />
          <PlayerInfoPanel
            pendingName={inspecting}
            info={game.playerInfo}
            onClose={closeInspect}
            onTransfer={
              game.account &&
              !(view?.spectating ?? pv?.spectating) &&
              game.playerInfo?.playerId !== youId
                ? (playerId, amount) => game.transferTokens({ playerId }, amount)
                : undefined
            }
          />
          <ReportButton
            lastReportId={game.lastReportId}
            onSend={(text) =>
              game.sendReport('bug', text, {
                view: view
                  ? summarise(view)
                  : pv && {
                      game: 'holdem',
                      code: pv.code,
                      format: pv.format,
                      phase: pv.phase,
                      hand: pv.handNo,
                      toActIsYou: pv.toAct === pv.youId,
                      log: pv.log.slice(-5),
                    },
              })
            }
          />
        </>
      )}

      {game.status !== 'online' && (view || pv) && (
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
