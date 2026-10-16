import { useRef, useEffect, type ReactElement } from 'react';
import {
  Animated,
  Clipboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

export type MessageRole = 'user' | 'assistant';

export interface PlaceRef {
  id: string;
  name: string;
}

export interface RouteRef {
  placeId: string;
  placeName: string;
}

export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp: number;
  placeRefs?: PlaceRef[];
  routeRef?: RouteRef;
  imageUri?: string;
  quickReplies?: string[];
  ratingPlaceId?: string;
  ratingPlaceName?: string;
}

export interface ChatBubbleProps {
  message: ChatMessage;
  index: number;
  onPlacePress?: (placeId: string) => void;
  onRoutePress?: (placeId: string, placeName: string) => void;
  onQuickReply?: (text: string) => void;
  onRatingSubmit?: (placeId: string, rating: number) => void;
}

const PRIMARY = '#1565C0';
const PRIMARY_LIGHT = '#E3F2FD';
const SUCCESS = '#2E7D32';
const SURFACE = '#F5F5F5';
const BORDER = '#E0E0E0';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function SlimPlaceCard({
  placeId,
  name,
  onPress,
}: {
  placeId: string;
  name: string;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      style={styles.placeCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <Text style={styles.placeCardPin}>📍</Text>
      <Text style={styles.placeCardName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.placeCardLink}>{t('chat.viewOnMap')}</Text>
    </Pressable>
  );
}

function RouteCard({
  placeId,
  placeName,
  onPress,
}: {
  placeId: string;
  placeName: string;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      style={styles.routeCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('chat.routeToA11y', { name: placeName })}
    >
      <Text style={styles.routeCardIcon}>🗺️</Text>
      <View style={styles.routeCardBody}>
        <Text style={styles.routeCardLabel}>{t('chat.routeTo')}</Text>
        <Text style={styles.routeCardName} numberOfLines={1}>
          {placeName}
        </Text>
      </View>
      <Text style={styles.routeCardStart}>{t('chat.startRoute')}</Text>
    </Pressable>
  );
}

function RatingCard({
  placeId,
  placeName,
  onSubmit,
}: {
  placeId: string;
  placeName: string;
  onSubmit: (rating: number) => void;
}): ReactElement {
  return (
    <View style={styles.ratingCard}>
      <Text style={styles.ratingCardTitle}>{t('chat.ratePlace', { name: placeName })}</Text>
      <View style={styles.ratingStars}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable
            key={star}
            onPress={() => onSubmit(star)}
            accessibilityRole="button"
            accessibilityLabel={t('chat.rateStars', { count: String(star) })}
            style={styles.ratingStar}
          >
            <Text style={styles.ratingStarText}>⭐</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ChatBubble({
  message,
  index,
  onPlacePress,
  onRoutePress,
  onQuickReply,
  onRatingSubmit,
}: ChatBubbleProps): ReactElement {
  const isUser = message.role === 'user';
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(isUser ? 20 : -20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleLongPress = () => {
    Clipboard.setString(message.content);
  };

  return (
    <Animated.View
      style={[
        styles.row,
        isUser ? styles.rowEnd : styles.rowStart,
        { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
      ]}
    >
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>🤖</Text>
        </View>
      )}

      <View style={[styles.bubbleWrapper, isUser ? styles.bubbleWrapperEnd : styles.bubbleWrapperStart]}>
        <Pressable
          testID={`chat.bubble.${index}`}
          style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}
          onLongPress={handleLongPress}
          delayLongPress={500}
          accessibilityRole="text"
          accessibilityLabel={
            isUser
              ? t('chat.msgFromUser', { content: message.content })
              : t('chat.msgFromAssistant', { content: message.content })
          }
        >
          <Text
            style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]}
          >
            {message.content}
          </Text>
          <Text
            style={[styles.timestamp, isUser ? styles.timestampUser : styles.timestampAssistant]}
          >
            {formatTime(message.timestamp)}
          </Text>
        </Pressable>

        {/* Place reference cards */}
        {message.placeRefs && message.placeRefs.length > 0 && onPlacePress && (
          <View style={styles.cardsContainer}>
            {message.placeRefs.map((ref) => (
              <SlimPlaceCard
                key={ref.id}
                placeId={ref.id}
                name={ref.name}
                onPress={() => onPlacePress(ref.id)}
              />
            ))}
          </View>
        )}

        {/* Route suggestion card */}
        {message.routeRef && onRoutePress && (
          <RouteCard
            placeId={message.routeRef.placeId}
            placeName={message.routeRef.placeName}
            onPress={() => onRoutePress(message.routeRef!.placeId, message.routeRef!.placeName)}
          />
        )}

        {/* Rating card */}
        {message.ratingPlaceId && message.ratingPlaceName && onRatingSubmit && (
          <RatingCard
            placeId={message.ratingPlaceId}
            placeName={message.ratingPlaceName}
            onSubmit={(rating) => onRatingSubmit(message.ratingPlaceId!, rating)}
          />
        )}

        {/* Quick reply chips below assistant message */}
        {!isUser && message.quickReplies && message.quickReplies.length > 0 && onQuickReply && (
          <View style={styles.quickReplies}>
            {message.quickReplies.map((qr, i) => (
              <Pressable
                key={i}
                style={styles.quickChip}
                onPress={() => onQuickReply(qr)}
                accessibilityRole="button"
                accessibilityLabel={qr}
              >
                <Text style={styles.quickChipText}>{qr}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 8,
    alignItems: 'flex-end',
    gap: 6,
  },
  rowEnd: {
    justifyContent: 'flex-end',
  },
  rowStart: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  avatarText: {
    fontSize: 16,
  },
  bubbleWrapper: {
    maxWidth: '78%',
    gap: 4,
  },
  bubbleWrapperEnd: {
    alignItems: 'flex-end',
  },
  bubbleWrapperStart: {
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: PRIMARY,
    borderBottomEndRadius: 4,
  },
  assistantBubble: {
    backgroundColor: SURFACE,
    borderBottomStartRadius: 4,
    borderWidth: 1,
    borderColor: BORDER,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#FFF',
    textAlign: 'auto' as const,
  },
  assistantText: {
    color: '#212121',
    textAlign: 'auto' as const,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
  },
  timestampUser: {
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'auto' as const,
  },
  timestampAssistant: {
    color: '#9E9E9E',
    textAlign: 'auto' as const,
  },
  cardsContainer: {
    gap: 4,
    width: '100%',
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PRIMARY_LIGHT,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  placeCardPin: {
    fontSize: 14,
  },
  placeCardName: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  placeCardLink: {
    fontSize: 12,
    color: PRIMARY,
    fontWeight: '600',
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    width: '100%',
  },
  routeCardIcon: {
    fontSize: 20,
  },
  routeCardBody: {
    flex: 1,
  },
  routeCardLabel: {
    fontSize: 11,
    color: '#555',
  },
  routeCardName: {
    fontSize: 13,
    color: '#1B5E20',
    fontWeight: '600',
  },
  routeCardStart: {
    fontSize: 12,
    color: SUCCESS,
    fontWeight: '600',
  },
  ratingCard: {
    backgroundColor: '#FFF9C4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F9A825',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  ratingCardTitle: {
    fontSize: 13,
    color: '#5D4037',
    textAlign: 'center',
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 4,
  },
  ratingStar: {
    padding: 4,
  },
  ratingStarText: {
    fontSize: 22,
  },
  quickReplies: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  quickChip: {
    backgroundColor: PRIMARY_LIGHT,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  quickChipText: {
    fontSize: 12,
    color: PRIMARY,
    fontWeight: '500',
  },
});
