/**
 * Доороос гарч ирэх цонхны давхарга.
 *
 * React Native-ийн `Modal`-ыг вэб дээр ашиглахад цонх үндсэн агуулгын ДООР,
 * дэлгэцээс гадуур байрлаж байсан тул өөрсдөө байрлуулна: вэб дээр
 * `position: fixed` нь дэлгэцийн хүрээнд наалддаг.
 *
 * ЧУХАЛ #1: бүрхэвч (backdrop) нь ХАРАНГ АБСОЛЮТААР дэлгэцийг бүрэн халхална.
 * Өмнө нь flex-ийн зайгаар түлхдэг байсан тул агуулга дэлгэцээс өндөр үед
 * (жишээ нь цол, түүхтэй профайл) бүрхэвч 0 өндөртэй болж, ард талын нүүр
 * хуудас харагдаж товчнууд давхцдаг байв. Мөн хуудсыг дэлгэцэд багтааж
 * дотор нь гүйлгэнэ — эс бөгөөс дээд тал нь дэлгэцээс гарч тасарна.
 *
 * ЧУХАЛ #2: вэб дээр цонхыг `document.body` руу PORTAL-аар гаргана. AuthPanel
 * нь HomeScreen-ий ScrollView ДОТОР байрладаг тул түүний `zIndex: 1000` зөвхөн
 * тэр дэд модны дотор өрсөлддөг байсан — хожуу дүрслэгддэг сул хуудасны товч
 * дээр нь гардаг байв. Portal нь бүх эцэг стек контекстээс мултарна.
 */

import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

/** Вэб дээр л portal хийнэ. Төрөлхийн платформд react-dom байхгүй. */
const createPortal: ((node: React.ReactNode, container: Element) => React.ReactPortal) | null =
  Platform.OS === 'web' && typeof document !== 'undefined'
    ? // eslint-disable-next-line @typescript-eslint/no-var-requires
      (require('react-dom').createPortal as never)
    : null;

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Overlay({ visible, onClose, children }: Props) {
  // Вэб дээр Esc дарж хаана.
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  const content = (
    <View style={styles.root}>
      {/* Бүтэн дэлгэцийг халхлах бүрхэвч — гадна дарахад хаагдана. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Хаах" />

      <KeyboardAvoidingView
        style={styles.holder}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>{children}</View>
      </KeyboardAvoidingView>
    </View>
  );

  // Вэб дээр body руу гаргаж бүх эцэг стек контекстээс мултарна.
  return createPortal ? createPortal(content, document.body) : content;
}

const fixed = (Platform.OS === 'web' ? 'fixed' : 'absolute') as ViewStyle['position'];

const styles = StyleSheet.create({
  root: {
    position: fixed,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  backdrop: {
    // Абсолют бүрхэвч — хуудасны өндрөөс үл хамааран ҮРГЭЛЖ бүтэн халхална.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  holder: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    // Хуудас дэлгэцээс өндөр бол дотроо гүйлгэнэ (AuthPanel-ийн ScrollView).
    width: '100%',
    maxHeight: '100%',
  },
});
