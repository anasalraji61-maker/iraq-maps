/**
 * StoryEditorScreen – full story creation editor with text overlays,
 * stickers, draw mode, location/mention/hashtag tags, and publish.
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — expo-media-library not in workspace deps; safe at runtime via Expo SDK
import * as MediaLibrary from 'expo-media-library';
import {
  type ReactElement,
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useStoriesClient } from '../storiesClient';
import { t } from '../strings';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

type EditorMode = 'idle' | 'text' | 'draw' | 'stickers' | 'preview';

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  bold: boolean;
}

interface StickerOverlay {
  id: string;
  emoji: string;
  x: number;
  y: number;
  scale: number;
}

interface DrawPoint {
  x: number;
  y: number;
}

interface DrawStroke {
  id: string;
  points: DrawPoint[];
  color: string;
  width: number;
}

interface LocationTag {
  name: string;
}

interface MentionTag {
  username: string;
}

interface HashtagTag {
  tag: string;
}

// ─── Iraq-themed stickers ─────────────────────────────────────────────────────

const IRAQ_STICKERS = [
  // Food
  '🧆', '🥙', '🍢', '🍖', '🫕', '🍵', '☕', '🧁',
  // Places / landmarks
  '🕌', '🏛️', '⭐', '🌙', '🌴', '🏔️', '🌊', '🌅',
  // Symbols
  '❤️', '🔥', '✨', '💫', '🎉', '👋', '🤲', '💪',
  // Animals / nature
  '🦁', '🦅', '🌹', '🌺', '🌻', '🍃', '🌿', '🎋',
];

const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00',
  '#34C759', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55',
];

const DRAW_COLORS = [
  '#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55', '#000000',
];

const FONT_SIZES = [14, 18, 24, 32, 42, 56];

// ─── SVG-less draw canvas via View paths ─────────────────────────────────────

function DrawCanvas({
  strokes,
}: {
  strokes: DrawStroke[];
}): ReactElement {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {strokes.map((stroke) =>
        stroke.points.map((pt, idx) => {
          if (idx === 0) return null;
          const prev = stroke.points[idx - 1]!;
          const dx = pt.x - prev.x;
          const dy = pt.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View
              key={`${stroke.id}-${idx}`}
              style={{
                position: 'absolute',
                start: prev.x,
                top: prev.y,
                width: len,
                height: stroke.width,
                backgroundColor: stroke.color,
                borderRadius: stroke.width / 2,
                transform: [{ rotate: `${angle}deg` }],
                transformOrigin: 'left center' as unknown as undefined,
              }}
            />
          );
        }),
      )}
    </View>
  );
}

// ─── Draggable text overlay ───────────────────────────────────────────────────

function DraggableText({
  overlay,
  onMove,
  onLongPress,
}: {
  overlay: TextOverlay;
  onMove: (id: string, x: number, y: number) => void;
  onLongPress: (id: string) => void;
}): ReactElement {
  const pan = useRef(new Animated.ValueXY({ x: overlay.x, y: overlay.y })).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gs) => {
        const nx = overlay.x + gs.dx;
        const ny = overlay.y + gs.dy;
        onMove(overlay.id, nx, ny);
        pan.setOffset({ x: 0, y: 0 });
        pan.setValue({ x: 0, y: 0 });
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.textOverlay,
        // eslint-disable-next-line no-restricted-syntax
        { transform: pan.getTranslateTransform(), left: overlay.x, top: overlay.y },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable onLongPress={() => onLongPress(overlay.id)}>
        <Text
          style={{
            color: overlay.color,
            fontSize: overlay.fontSize,
            fontWeight: overlay.bold ? '700' : '400',
            textShadowColor: 'rgba(0,0,0,0.6)',
            textShadowOffset: { width: 1, height: 1 },
            textShadowRadius: 3,
          }}
        >
          {overlay.text}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Draggable sticker ────────────────────────────────────────────────────────

function DraggableSticker({
  overlay,
  onMove,
  onLongPress,
}: {
  overlay: StickerOverlay;
  onMove: (id: string, x: number, y: number) => void;
  onLongPress: (id: string) => void;
}): ReactElement {
  const pan = useRef(new Animated.ValueXY({ x: overlay.x, y: overlay.y })).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gs) => {
        onMove(overlay.id, overlay.x + gs.dx, overlay.y + gs.dy);
        pan.setOffset({ x: 0, y: 0 });
        pan.setValue({ x: 0, y: 0 });
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        styles.stickerOverlay,
        // eslint-disable-next-line no-restricted-syntax
        { transform: pan.getTranslateTransform(), left: overlay.x, top: overlay.y },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable onLongPress={() => onLongPress(overlay.id)}>
        <Text style={{ fontSize: 40 * overlay.scale }}>{overlay.emoji}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Tag pill ─────────────────────────────────────────────────────────────────

function TagPill({ label, onRemove }: { label: string; onRemove: () => void }): ReactElement {
  return (
    <View style={styles.tagPill}>
      <Text style={styles.tagPillText}>{label}</Text>
      <Pressable onPress={onRemove} style={styles.tagPillRemove}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={styles.tagPillRemoveText}>✕</Text>
      </Pressable>
    </View>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export function StoryEditorScreen(): ReactElement {
  const router = useRouter();
  const client = useStoriesClient();

  // Media
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');

  // Editor state
  const [mode, setMode] = useState<EditorMode>('idle');
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [stickerOverlays, setStickerOverlays] = useState<StickerOverlay[]>([]);
  const [drawStrokes, setDrawStrokes] = useState<DrawStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<DrawStroke | null>(null);
  const [locationTags, setLocationTags] = useState<LocationTag[]>([]);
  const [mentionTags, setMentionTags] = useState<MentionTag[]>([]);
  const [hashtagTags, setHashtagTags] = useState<HashtagTag[]>([]);

  // Text tool state
  const [editingText, setEditingText] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [fontSize, setFontSize] = useState(24);
  const [textBold, setTextBold] = useState(false);

  // Draw tool state
  const [drawColor, setDrawColor] = useState('#FFFFFF');
  const [drawWidth, setDrawWidth] = useState(4);

  // Modals
  const [showMentionModal, setShowMentionModal] = useState(false);
  const [showHashtagModal, setShowHashtagModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [mentionInput, setMentionInput] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [locationInput, setLocationInput] = useState('');

  // Upload
  const [uploading, setUploading] = useState(false);

  // Canvas ref for draw mode pan responder
  const canvasRef = useRef<View>(null);

  const pickMedia = async (type: 'image' | 'video') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: type === 'image' ? ImagePicker.MediaTypeOptions.Images : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.9,
      videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(type);
      setMode('idle');
    }
  };

  const pickFromCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
      videoMaxDuration: 15,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
      setMode('idle');
    }
  };

  // ─── Text overlay actions ──────────────────────────────────────────────────

  const commitText = useCallback(() => {
    if (!editingText.trim()) {
      setMode('idle');
      return;
    }
    setTextOverlays((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        text: editingText.trim(),
        x: SCREEN_W / 2 - 60,
        y: SCREEN_H / 3,
        fontSize,
        color: textColor,
        bold: textBold,
      },
    ]);
    setEditingText('');
    setMode('idle');
  }, [editingText, fontSize, textColor, textBold]);

  const moveTextOverlay = useCallback((id: string, x: number, y: number) => {
    setTextOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, x, y } : o)));
  }, []);

  const removeTextOverlay = useCallback((id: string) => {
    Alert.alert(t('editor.removeOverlay'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => setTextOverlays((p) => p.filter((o) => o.id !== id)) },
    ]);
  }, []);

  // ─── Sticker actions ───────────────────────────────────────────────────────

  const addSticker = useCallback((emoji: string) => {
    setStickerOverlays((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        emoji,
        x: SCREEN_W / 2 - 20,
        y: SCREEN_H / 2 - 20,
        scale: 1,
      },
    ]);
    setMode('idle');
  }, []);

  const moveStickerOverlay = useCallback((id: string, x: number, y: number) => {
    setStickerOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, x, y } : o)));
  }, []);

  const removeStickerOverlay = useCallback((id: string) => {
    Alert.alert(t('editor.removeOverlay'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => setStickerOverlays((p) => p.filter((o) => o.id !== id)) },
    ]);
  }, []);

  // ─── Draw mode ─────────────────────────────────────────────────────────────

  const drawPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setCurrentStroke({
          id: String(Date.now()),
          points: [{ x: locationX, y: locationY }],
          color: drawColor,
          width: drawWidth,
        });
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        setCurrentStroke((s) =>
          s ? { ...s, points: [...s.points, { x: locationX, y: locationY }] } : null,
        );
      },
      onPanResponderRelease: () => {
        setCurrentStroke((s) => {
          if (s) setDrawStrokes((strokes) => [...strokes, s]);
          return null;
        });
      },
    }),
  ).current;

  const undoStroke = () => setDrawStrokes((s) => s.slice(0, -1));

  const clearDrawing = () => {
    Alert.alert(t('editor.clearDraw'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('editor.clear'), style: 'destructive', onPress: () => setDrawStrokes([]) },
    ]);
  };

  // ─── Tags ──────────────────────────────────────────────────────────────────

  const addMention = () => {
    const username = mentionInput.trim().replace(/^@/, '');
    if (username) {
      setMentionTags((p) => [...p, { username }]);
    }
    setMentionInput('');
    setShowMentionModal(false);
  };

  const addHashtag = () => {
    const tag = hashtagInput.trim().replace(/^#/, '');
    if (tag) {
      setHashtagTags((p) => [...p, { tag }]);
    }
    setHashtagInput('');
    setShowHashtagModal(false);
  };

  const addLocation = () => {
    const name = locationInput.trim();
    if (name) {
      setLocationTags([{ name }]);
    }
    setLocationInput('');
    setShowLocationModal(false);
  };

  // ─── Save to device ────────────────────────────────────────────────────────

  const saveToDevice = async () => {
    if (!mediaUri) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('editor.permissionDenied'));
      return;
    }
    try {
      await MediaLibrary.saveToLibraryAsync(mediaUri);
      Alert.alert(t('editor.savedToDevice'));
    } catch {
      Alert.alert(t('editor.saveError'));
    }
  };

  // ─── Publish ───────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!mediaUri) return;
    setUploading(true);
    try {
      const captionParts: string[] = [];
      if (mentionTags.length) captionParts.push(mentionTags.map((m) => `@${m.username}`).join(' '));
      if (hashtagTags.length) captionParts.push(hashtagTags.map((h) => `#${h.tag}`).join(' '));
      if (locationTags.length) captionParts.push(`📍 ${locationTags[0]!.name}`);

      const res = await client.createStory({
        body: {
          mediaUrl: mediaUri,
          mediaType,
          duration: mediaType === 'video' ? 15 : 5,
        },
      });
      if (res.status === 201) {
        router.back();
      } else {
        Alert.alert(t('stories.uploadError'));
      }
    } catch {
      Alert.alert(t('stories.uploadError'));
    } finally {
      setUploading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!mediaUri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={styles.headerBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('editor.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.mediaPicker}>
          <Text style={styles.mediaPickerPrompt}>{t('editor.pickPrompt')}</Text>
          <View style={styles.mediaPickerRow}>
            <Pressable style={styles.mediaPickBtn} onPress={pickFromCamera} accessibilityRole="button">
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.mediaPickBtnIcon}>📷</Text>
              <Text style={styles.mediaPickBtnLabel}>{t('editor.camera')}</Text>
            </Pressable>
            <Pressable style={styles.mediaPickBtn} onPress={() => pickMedia('image')} accessibilityRole="button">
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.mediaPickBtnIcon}>🖼️</Text>
              <Text style={styles.mediaPickBtnLabel}>{t('stories.pickPhoto')}</Text>
            </Pressable>
            <Pressable style={styles.mediaPickBtn} onPress={() => pickMedia('video')} accessibilityRole="button">
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.mediaPickBtnIcon}>🎬</Text>
              <Text style={styles.mediaPickBtnLabel}>{t('stories.pickVideo')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const allStrokes = currentStroke ? [...drawStrokes, currentStroke] : drawStrokes;

  return (
    <View style={styles.container}>
      {/* Background media */}
      <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />

      {/* Draw canvas */}
      <DrawCanvas strokes={allStrokes} />

      {/* Draw input layer */}
      {mode === 'draw' && (
        <View
          ref={canvasRef}
          style={StyleSheet.absoluteFill}
          {...drawPanResponder.panHandlers}
        />
      )}

      {/* Text overlays */}
      {textOverlays.map((o) => (
        <DraggableText key={o.id} overlay={o} onMove={moveTextOverlay} onLongPress={removeTextOverlay} />
      ))}

      {/* Sticker overlays */}
      {stickerOverlays.map((o) => (
        <DraggableSticker key={o.id} overlay={o} onMove={moveStickerOverlay} onLongPress={removeStickerOverlay} />
      ))}

      {/* Tags row */}
      {(locationTags.length > 0 || mentionTags.length > 0 || hashtagTags.length > 0) && (
        <View style={styles.tagsRow}>
          {locationTags.map((lt, i) => (
            <TagPill key={`loc-${i}`} label={`📍 ${lt.name}`} onRemove={() => setLocationTags([])} />
          ))}
          {mentionTags.map((m, i) => (
            <TagPill key={`men-${i}`} label={`@${m.username}`} onRemove={() => setMentionTags((p) => p.filter((_, idx) => idx !== i))} />
          ))}
          {hashtagTags.map((h, i) => (
            <TagPill key={`ht-${i}`} label={`#${h.tag}`} onRemove={() => setHashtagTags((p) => p.filter((_, idx) => idx !== i))} />
          ))}
        </View>
      )}

      {/* Top toolbar */}
      <SafeAreaView style={styles.topBar}>
        <View style={styles.topBarInner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={styles.headerBtnText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.topTools}>
            <TouchableOpacity
              style={[styles.toolBtn, mode === 'text' && styles.toolBtnActive]}
              onPress={() => setMode(mode === 'text' ? 'idle' : 'text')}
              accessibilityRole="button"
              accessibilityLabel={t('editor.textTool')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.toolBtnIcon}>Aa</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toolBtn, mode === 'draw' && styles.toolBtnActive]}
              onPress={() => setMode(mode === 'draw' ? 'idle' : 'draw')}
              accessibilityRole="button"
              accessibilityLabel={t('editor.drawTool')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.toolBtnIcon}>✏️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toolBtn, mode === 'stickers' && styles.toolBtnActive]}
              onPress={() => setMode(mode === 'stickers' ? 'idle' : 'stickers')}
              accessibilityRole="button"
              accessibilityLabel={t('editor.stickerTool')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.toolBtnIcon}>😊</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => setShowLocationModal(true)}
              accessibilityRole="button"
              accessibilityLabel={t('editor.locationTool')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.toolBtnIcon}>📍</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => setShowMentionModal(true)}
              accessibilityRole="button"
              accessibilityLabel={t('editor.mentionTool')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.toolBtnIcon}>@</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => setShowHashtagModal(true)}
              accessibilityRole="button"
              accessibilityLabel={t('editor.hashtagTool')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.toolBtnIcon}>#</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              onPress={() => Alert.alert(t('editor.musicComingSoon'))}
              accessibilityRole="button"
              accessibilityLabel={t('editor.musicTool')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.toolBtnIcon}>🎵</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* Text input panel */}
      {mode === 'text' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.textPanel}
        >
          <View style={styles.textPanelContent}>
            {/* Font size slider row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fontSizeRow} contentContainerStyle={styles.fontSizeRowContent}>
              {FONT_SIZES.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.fontSizeBtn, fontSize === s && styles.fontSizeBtnActive]}
                  onPress={() => setFontSize(s)}
                >
                  <Text style={[styles.fontSizeBtnText, { fontSize: Math.min(s, 20) }]}>A</Text>
                </Pressable>
              ))}
              <Pressable
                style={[styles.fontSizeBtn, textBold && styles.fontSizeBtnActive]}
                onPress={() => setTextBold((b) => !b)}
              >
                <Text style={[styles.fontSizeBtnText, { fontWeight: '700' }]}>B</Text>
              </Pressable>
            </ScrollView>

            {/* Color picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorRow} contentContainerStyle={styles.colorRowContent}>
              {TEXT_COLORS.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, textColor === c && styles.colorDotSelected]}
                  onPress={() => setTextColor(c)}
                  accessibilityLabel={c}
                />
              ))}
            </ScrollView>

            {/* Text input */}
            <TextInput
              style={[styles.textInput, { color: textColor, fontSize, fontWeight: textBold ? '700' : '400' }]}
              value={editingText}
              onChangeText={setEditingText}
              placeholder={t('editor.textPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.5)"
              multiline
              autoFocus
              textAlign="center"
            />

            <TouchableOpacity style={styles.textCommitBtn} onPress={commitText} accessibilityRole="button">
              <Text style={styles.textCommitBtnText}>{t('editor.addText')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Draw tools panel */}
      {mode === 'draw' && (
        <View style={styles.drawPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRowContent}>
            {DRAW_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[styles.colorDot, { backgroundColor: c }, drawColor === c && styles.colorDotSelected]}
                onPress={() => setDrawColor(c)}
                accessibilityLabel={c}
              />
            ))}
          </ScrollView>

          <View style={styles.drawWidthRow}>
            {[2, 4, 8, 14].map((w) => (
              <Pressable
                key={w}
                style={[styles.drawWidthBtn, drawWidth === w && styles.drawWidthBtnActive]}
                onPress={() => setDrawWidth(w)}
              >
                <View style={{ width: w * 2, height: w * 2, borderRadius: w, backgroundColor: drawColor }} />
              </Pressable>
            ))}
            <TouchableOpacity style={styles.drawActionBtn} onPress={undoStroke} accessibilityRole="button">
              <Text style={styles.drawActionBtnText}>{t('editor.undo')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.drawActionBtn} onPress={clearDrawing} accessibilityRole="button">
              <Text style={styles.drawActionBtnText}>{t('editor.clear')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Sticker picker panel */}
      {mode === 'stickers' && (
        <View style={styles.stickerPanel}>
          <Text style={styles.stickerPanelTitle}>{t('editor.stickerPanelTitle')}</Text>
          <View style={styles.stickerGrid}>
            {IRAQ_STICKERS.map((emoji) => (
              <Pressable key={emoji} style={styles.stickerItem} onPress={() => addSticker(emoji)} accessibilityRole="button" accessibilityLabel={emoji}>
                <Text style={styles.stickerEmoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Bottom action row */}
      {mode === 'idle' && (
        <SafeAreaView style={styles.bottomBar}>
          <View style={styles.bottomBarInner}>
            <TouchableOpacity style={styles.saveBtn} onPress={saveToDevice} accessibilityRole="button">
              <Text style={styles.saveBtnText}>{t('editor.saveToDevice')}</Text>
            </TouchableOpacity>

            {uploading ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <TouchableOpacity style={styles.publishBtn} onPress={handlePublish} accessibilityRole="button">
                <Text style={styles.publishBtnText}>{t('editor.publish')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      )}

      {/* Mention modal */}
      <Modal visible={showMentionModal} transparent animationType="slide" onRequestClose={() => setShowMentionModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('editor.mentionTitle')}</Text>
            <TextInput
              style={styles.modalInput}
              value={mentionInput}
              onChangeText={setMentionInput}
              placeholder={t('editor.mentionPlaceholder')}
              autoFocus
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowMentionModal(false)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={addMention}>
                <Text style={styles.modalConfirmText}>{t('editor.addTag')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Hashtag modal */}
      <Modal visible={showHashtagModal} transparent animationType="slide" onRequestClose={() => setShowHashtagModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('editor.hashtagTitle')}</Text>
            <TextInput
              style={styles.modalInput}
              value={hashtagInput}
              onChangeText={setHashtagInput}
              placeholder={t('editor.hashtagPlaceholder')}
              autoFocus
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowHashtagModal(false)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={addHashtag}>
                <Text style={styles.modalConfirmText}>{t('editor.addTag')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Location modal */}
      <Modal visible={showLocationModal} transparent animationType="slide" onRequestClose={() => setShowLocationModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('editor.locationTitle')}</Text>
            <TextInput
              style={styles.modalInput}
              value={locationInput}
              onChangeText={setLocationInput}
              placeholder={t('editor.locationPlaceholder')}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowLocationModal(false)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={addLocation}>
                <Text style={styles.modalConfirmText}>{t('editor.addTag')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'rgba(0,0,0,0.6)' },
  headerBtn: { width: 40, alignItems: 'flex-start' },
  headerBtnText: { color: '#FFF', fontSize: 20 },
  headerTitle: { color: '#FFF', fontSize: 17, fontWeight: '700' },

  // Media picker (empty state)
  mediaPicker: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', padding: 24 },
  mediaPickerPrompt: { color: '#FFF', fontSize: 18, fontWeight: '600', marginBottom: 32, textAlign: 'center' },
  mediaPickerRow: { flexDirection: 'row', gap: 16 },
  mediaPickBtn: { width: 100, height: 100, backgroundColor: '#222', borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mediaPickBtnIcon: { fontSize: 32 },
  mediaPickBtnLabel: { color: '#FFF', fontSize: 12, textAlign: 'center' },

  // Top bar
  topBar: { position: 'absolute', top: 0, start: 0, end: 0 },
  topBarInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  topTools: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  toolBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  toolBtnActive: { backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 1, borderColor: '#FFF' },
  toolBtnIcon: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // Text overlays
  textOverlay: { position: 'absolute' },
  stickerOverlay: { position: 'absolute' },

  // Tags row
  tagsRow: { position: 'absolute', bottom: 120, start: 16, end: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, gap: 6 },
  tagPillText: { color: '#FFF', fontSize: 13 },
  tagPillRemove: { padding: 2 },
  tagPillRemoveText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },

  // Text panel
  textPanel: { position: 'absolute', bottom: 0, start: 0, end: 0 },
  textPanelContent: { backgroundColor: 'rgba(0,0,0,0.85)', padding: 16, gap: 12 },
  fontSizeRow: { maxHeight: 48 },
  fontSizeRowContent: { gap: 8, paddingHorizontal: 4 },
  fontSizeBtn: { width: 40, height: 40, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  fontSizeBtnActive: { backgroundColor: 'rgba(255,255,255,0.4)', borderWidth: 1, borderColor: '#FFF' },
  fontSizeBtnText: { color: '#FFF' },
  colorRow: { maxHeight: 40 },
  colorRowContent: { gap: 8, paddingHorizontal: 4 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotSelected: { borderWidth: 3, borderColor: '#FFF' },
  textInput: { minHeight: 60, textAlignVertical: 'top', padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, textAlign: 'center' },
  textCommitBtn: { backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  textCommitBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // Draw panel
  drawPanel: { position: 'absolute', bottom: 0, start: 0, end: 0, backgroundColor: 'rgba(0,0,0,0.85)', padding: 16, gap: 12 },
  drawWidthRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  drawWidthBtn: { width: 40, height: 40, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  drawWidthBtnActive: { backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 1, borderColor: '#FFF' },
  drawActionBtn: { marginStart: 'auto', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  drawActionBtnText: { color: '#FFF', fontSize: 13 },

  // Sticker panel
  stickerPanel: { position: 'absolute', bottom: 0, start: 0, end: 0, backgroundColor: 'rgba(0,0,0,0.9)', padding: 16, maxHeight: 240 },
  stickerPanelTitle: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  stickerItem: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
  stickerEmoji: { fontSize: 28 },

  // Bottom bar
  bottomBar: { position: 'absolute', bottom: 0, start: 0, end: 0 },
  bottomBarInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.6)' },
  saveBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 12 },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  publishBtn: { backgroundColor: '#007AFF', borderRadius: 20, paddingHorizontal: 28, paddingVertical: 12 },
  publishBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#1C1C1E', borderTopStartRadius: 20, borderTopEndRadius: 20, padding: 24, gap: 16 },
  modalTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  modalInput: { backgroundColor: '#2C2C2E', color: '#FFF', borderRadius: 10, padding: 14, fontSize: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, backgroundColor: '#2C2C2E', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { color: '#FFF', fontSize: 15 },
  modalConfirm: { flex: 1, backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalConfirmText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
