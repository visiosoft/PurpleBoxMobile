import React, { useRef, useState, useEffect, memo } from 'react'
import {
    View,
    Text,
    TextInput,
    Animated,
    PanResponder,
    Dimensions,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    type GestureResponderEvent,
    type PanResponderGestureState,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SHADOWS, avatarStyle } from '../lib/theme'
import PressableScale from './PressableScale'

const SCREEN_WIDTH = Dimensions.get('window').width
const SWIPE_THRESHOLD = 85

export type DashboardItemType = 'new_lead' | 'followup_today' | 'followup_overdue' | 'reminder'

export interface DashboardCardProps {
    id: string
    type: DashboardItemType
    title: string
    subtitle?: string
    note?: string
    lastMessage?: string
    lastMessageMine?: boolean
    timeText?: string
    phone: string
    leadStatus?: string
    source?: string
    index?: number
    onChat: () => void
    onReschedule: () => void
    onOpenDetails?: () => void
    /** BayOps' "exactly one tile expanded" idea — everything below is
     *  additive and only shows up when expanded, so the existing
     *  collapsed card (tap to chat, swipe for the shortcuts) is untouched. */
    expanded?: boolean
    onToggleExpand?: () => void
    whyNow?: string
    suggestedMessage?: string
    sendingMessage?: boolean
    onSendSuggested?: (text: string) => void
    aiValue?: string
    onChangeAi?: (value: string) => void
    onSubmitAi?: () => void
    aiBusy?: boolean
}

function SwipeableDashboardCard({
    id,
    type,
    title,
    subtitle,
    note,
    lastMessage,
    lastMessageMine,
    timeText,
    phone,
    leadStatus,
    source,
    index = 0,
    onChat,
    onReschedule,
    onOpenDetails,
    expanded = false,
    onToggleExpand,
    whyNow,
    suggestedMessage,
    sendingMessage,
    onSendSuggested,
    aiValue = '',
    onChangeAi,
    onSubmitAi,
    aiBusy,
}: DashboardCardProps) {
    const [suggestionDraft, setSuggestionDraft] = useState(suggestedMessage || '')
    const [editingSuggestion, setEditingSuggestion] = useState(false)
    const firstName = title.split(' ')[0] || title

    // Follows a freshly (re)computed suggestion, but only while the rep
    // hasn't started editing it themselves — their own edit always wins.
    useEffect(() => {
        if (!editingSuggestion) setSuggestionDraft(suggestedMessage || '')
    }, [suggestedMessage, editingSuggestion])
    const pan = useRef(new Animated.Value(0)).current
    const cardScale = useRef(new Animated.Value(1)).current
    const cardOpacity = useRef(new Animated.Value(1)).current

    const triggerAction = (direction: 'left' | 'right') => {
        if (direction === 'right') {
            // Animate card right and open chat
            Animated.parallel([
                Animated.timing(pan, {
                    toValue: SCREEN_WIDTH,
                    duration: 180,
                    useNativeDriver: true,
                }),
                Animated.timing(cardOpacity, {
                    toValue: 0,
                    duration: 180,
                    useNativeDriver: true,
                }),
                Animated.timing(cardScale, {
                    toValue: 0.85,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                onChat()
            })
        } else {
            // Swipe Left -> Reschedule: spring back and open reschedule sheet
            Animated.spring(pan, {
                toValue: 0,
                friction: 6,
                tension: 40,
                useNativeDriver: true,
            }).start(() => {
                onReschedule()
            })
        }
    }

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
                return (
                    Math.abs(gestureState.dx) > 12 &&
                    Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
                )
            },
            onPanResponderMove: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
                pan.setValue(gestureState.dx)
            },
            onPanResponderRelease: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
                if (gestureState.dx > SWIPE_THRESHOLD) {
                    // Swiped Right -> Chat
                    triggerAction('right')
                } else if (gestureState.dx < -SWIPE_THRESHOLD) {
                    // Swiped Left -> Reschedule
                    triggerAction('left')
                } else {
                    // Reset
                    Animated.spring(pan, {
                        toValue: 0,
                        friction: 7,
                        tension: 40,
                        useNativeDriver: true,
                    }).start()
                }
            },
        })
    ).current

    // Left action (revealed when swiping right -> Chat)
    const chatOpacity = pan.interpolate({
        inputRange: [0, 30, SWIPE_THRESHOLD],
        outputRange: [0, 0.6, 1],
        extrapolate: 'clamp',
    })
    const chatScale = pan.interpolate({
        inputRange: [0, SWIPE_THRESHOLD],
        outputRange: [0.75, 1],
        extrapolate: 'clamp',
    })

    // Right action (revealed when swiping left -> Reschedule)
    const rescheduleOpacity = pan.interpolate({
        inputRange: [-SWIPE_THRESHOLD, -30, 0],
        outputRange: [1, 0.6, 0],
        extrapolate: 'clamp',
    })
    const rescheduleScale = pan.interpolate({
        inputRange: [-SWIPE_THRESHOLD, 0],
        outputRange: [1, 0.75],
        extrapolate: 'clamp',
    })

    const av = avatarStyle(index)

    // Type styling
    const typeConfig = {
        new_lead: {
            badgeBg: '#E8EEFF',
            badgeText: '#2947C9',
            badgeLabel: 'NEW LEAD',
            badgeIcon: 'sparkles' as const,
            borderColor: '#D4E2FF',
        },
        followup_today: {
            badgeBg: COLORS.warnTint,
            badgeText: COLORS.warnInk,
            badgeLabel: 'TODAY FOLLOW-UP',
            badgeIcon: 'alarm-outline' as const,
            borderColor: '#FDE4C8',
        },
        followup_overdue: {
            badgeBg: COLORS.dangerTint,
            badgeText: COLORS.danger,
            badgeLabel: 'OVERDUE REMINDER',
            badgeIcon: 'alert-circle' as const,
            borderColor: '#FECDCA',
        },
        reminder: {
            badgeBg: COLORS.purple100,
            badgeText: COLORS.purple600,
            badgeLabel: 'IMPORTANT REMINDER',
            badgeIcon: 'notifications' as const,
            borderColor: COLORS.purple200,
        },
    }[type]

    return (
        <Animated.View
            style={{
                opacity: cardOpacity,
                transform: [{ scale: cardScale }],
                marginBottom: 0,
                marginTop: 0,
            }}
        >
            <View style={styles.container}>
                {/* Background Action - Swipe Right to Chat */}
                <Animated.View
                    style={[
                        styles.actionBackground,
                        styles.chatBackground,
                        { opacity: chatOpacity },
                    ]}
                >
                    <Animated.View
                        style={[
                            styles.actionContentLeft,
                            { transform: [{ scale: chatScale }] },
                        ]}
                    >
                        <View style={styles.actionIconCircle}>
                            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                        </View>
                        <View>
                            <Text style={styles.actionMainText}>Chat & Open</Text>
                            <Text style={styles.actionSubText}>Swipe right to start</Text>
                        </View>
                    </Animated.View>
                </Animated.View>

                {/* Background Action - Swipe Left to Reschedule */}
                <Animated.View
                    style={[
                        styles.actionBackground,
                        styles.rescheduleBackground,
                        { opacity: rescheduleOpacity },
                    ]}
                >
                    <Animated.View
                        style={[
                            styles.actionContentRight,
                            { transform: [{ scale: rescheduleScale }] },
                        ]}
                    >
                        <View>
                            <Text style={[styles.actionMainText, { textAlign: 'right' }]}>
                                Reschedule
                            </Text>
                            <Text style={[styles.actionSubText, { textAlign: 'right' }]}>
                                Set new follow-up date
                            </Text>
                        </View>
                        <View style={[styles.actionIconCircle, { backgroundColor: 'rgba(255,255,255,0.24)' }]}>
                            <Ionicons name="calendar" size={20} color="#fff" />
                        </View>
                    </Animated.View>
                </Animated.View>

                {/* Foreground Card */}
                <Animated.View
                    {...panResponder.panHandlers}
                    style={[
                        styles.card,
                        {
                            transform: [{ translateX: pan }],
                        },
                    ]}
                >
                    {/* Main Lead / Reminder Info */}
                    <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={() => triggerAction('right')}
                        style={styles.mainPressable}
                    >
                        <View style={styles.infoRow}>
                            <View
                                style={[
                                    styles.avatar,
                                    { backgroundColor: av.bg },
                                ]}
                            >
                                <Text style={[styles.avatarText, { color: av.text }]}>
                                    {title.slice(0, 1).toUpperCase()}
                                </Text>
                            </View>

                            <View style={styles.infoCenter}>
                                <View style={styles.nameRow}>
                                    <Text style={styles.nameText} numberOfLines={1}>
                                        {title}
                                    </Text>
                                    {!!timeText && <Text style={styles.timeText}>{timeText}</Text>}
                                </View>

                                <Text style={styles.phoneText} numberOfLines={1}>
                                    {phone}
                                </Text>

                                {(lastMessage || note) ? (
                                    <View style={styles.messageRow}>
                                        <Ionicons name="logo-whatsapp" size={12} color={COLORS.whatsapp} />
                                        <Text style={styles.messageText} numberOfLines={1}>
                                            {lastMessage || note}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>

                            <View style={[styles.statusDot, { backgroundColor: typeConfig.badgeText }]} />
                        </View>
                    </TouchableOpacity>

                    {!!onToggleExpand && (
                        <PressableScale onPress={onToggleExpand} style={styles.expandStrip} hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}>
                            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.ink4} />
                        </PressableScale>
                    )}

                    {expanded && (whyNow || suggestedMessage !== undefined || onSubmitAi) && (
                        <View style={styles.expandedSection}>
                            {!!whyNow && (
                                <View style={styles.whyNowBox}>
                                    <Text style={styles.whyNowLabel}>WHY NOW</Text>
                                    <Text style={styles.whyNowText}>{whyNow}</Text>
                                </View>
                            )}

                            {suggestedMessage !== undefined && (
                                <View style={styles.suggestBox}>
                                    <Text style={styles.suggestLabel}>+ SUGGESTED · WHATSAPP</Text>
                                    {editingSuggestion ? (
                                        <TextInput
                                            value={suggestionDraft}
                                            onChangeText={setSuggestionDraft}
                                            multiline
                                            style={styles.suggestInput}
                                            autoFocus
                                        />
                                    ) : (
                                        <Text style={styles.suggestText}>{suggestionDraft}</Text>
                                    )}
                                    <View style={styles.suggestActions}>
                                        <PressableScale
                                            disabled={sendingMessage || !suggestionDraft.trim()}
                                            onPress={() => onSendSuggested?.(suggestionDraft)}
                                            style={styles.sendButton}
                                        >
                                            {sendingMessage ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendButtonText}>Send</Text>}
                                        </PressableScale>
                                        <PressableScale onPress={() => setEditingSuggestion((v) => !v)} style={styles.editButton}>
                                            <Text style={styles.editButtonText}>{editingSuggestion ? 'Done' : 'Edit'}</Text>
                                        </PressableScale>
                                    </View>
                                </View>
                            )}

                            {!!onSubmitAi && (
                                <View style={styles.aiFieldRow}>
                                    <Ionicons name="sparkles" size={13} color={COLORS.brandDark} />
                                    <TextInput
                                        value={aiValue}
                                        onChangeText={onChangeAi}
                                        onSubmitEditing={onSubmitAi}
                                        placeholder={`Tell AI what you want to do with ${firstName}…`}
                                        placeholderTextColor={COLORS.ink3}
                                        editable={!aiBusy}
                                        style={styles.aiFieldInput}
                                    />
                                    {aiBusy ? (
                                        <ActivityIndicator size="small" color={COLORS.brandDark} />
                                    ) : (
                                        <PressableScale onPress={onSubmitAi} disabled={!aiValue?.trim()}>
                                            <Ionicons name="arrow-up-circle" size={22} color={aiValue?.trim() ? COLORS.brandDark : COLORS.ink3} />
                                        </PressableScale>
                                    )}
                                </View>
                            )}
                        </View>
                    )}
                </Animated.View>
            </View>
        </Animated.View>
    )
}

export default memo(SwipeableDashboardCard)

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
    },
    actionBackground: {
        // Not absoluteFillObject — this RN version only ships absoluteFill
        // (the type checker already flagged this; it wasn't just a stale
        // type, the property is genuinely undefined at runtime here, so
        // this layer rendered as a normal in-flow block instead of pinned
        // behind the card — inflating every card's height by its own).
        ...StyleSheet.absoluteFill,
        borderRadius: 16,
        justifyContent: 'center',
    },
    chatBackground: {
        backgroundColor: '#1DAA50',
        alignItems: 'flex-start',
        paddingLeft: 18,
    },
    rescheduleBackground: {
        backgroundColor: COLORS.purple600,
        alignItems: 'flex-end',
        paddingRight: 18,
    },
    actionContentLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionContentRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionIconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionMainText: {
        fontFamily: FONTS.bodyBold,
        fontSize: 14,
        color: '#fff',
    },
    actionSubText: {
        fontFamily: FONTS.body,
        fontSize: 11,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 1,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.line,
        padding: 14,
        ...SHADOWS.card,
    },
    mainPressable: {},
    infoRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    avatarText: {
        fontFamily: FONTS.display,
        fontSize: 15,
    },
    infoCenter: {
        flex: 1,
        minWidth: 0,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
    },
    nameText: {
        fontFamily: FONTS.bodyBold,
        fontSize: 16,
        color: COLORS.ink,
        flexShrink: 1,
    },
    timeText: {
        fontFamily: FONTS.body,
        fontSize: 12,
        color: COLORS.ink3,
        flexShrink: 0,
    },
    phoneText: {
        marginTop: 2,
        fontFamily: FONTS.body,
        fontSize: 12,
        color: COLORS.ink3,
    },
    messageRow: {
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
    },
    messageText: {
        flex: 1,
        fontFamily: FONTS.body,
        fontSize: 13,
        lineHeight: 17,
        color: COLORS.ink2,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: 6,
        flexShrink: 0,
    },
    expandStrip: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    expandedSection: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: COLORS.line,
        gap: 10,
    },
    whyNowBox: {
        backgroundColor: COLORS.surfaceAlt,
        borderRadius: 10,
        padding: 10,
    },
    whyNowLabel: {
        fontFamily: FONTS.bodyBold,
        fontSize: 9.5,
        letterSpacing: 0.4,
        color: COLORS.ink3,
        marginBottom: 3,
    },
    whyNowText: {
        fontFamily: FONTS.body,
        fontSize: 12,
        lineHeight: 16,
        color: COLORS.ink2,
    },
    suggestBox: {
        backgroundColor: COLORS.brandTint,
        borderRadius: 10,
        padding: 10,
    },
    suggestLabel: {
        fontFamily: FONTS.bodyBold,
        fontSize: 9.5,
        letterSpacing: 0.4,
        color: COLORS.brandDark,
        marginBottom: 4,
    },
    suggestText: {
        fontFamily: FONTS.body,
        fontSize: 12.5,
        lineHeight: 17,
        color: COLORS.ink,
    },
    suggestInput: {
        fontFamily: FONTS.body,
        fontSize: 12.5,
        lineHeight: 17,
        color: COLORS.ink,
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 8,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    suggestActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    sendButton: {
        flex: 1,
        height: 32,
        borderRadius: 8,
        backgroundColor: COLORS.brand,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonText: {
        fontFamily: FONTS.bodyBold,
        fontSize: 12,
        color: '#fff',
    },
    editButton: {
        flex: 1,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    editButtonText: {
        fontFamily: FONTS.bodyBold,
        fontSize: 12,
        color: COLORS.ink3,
    },
    aiFieldRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: COLORS.brandTint,
        borderRadius: 999,
        paddingHorizontal: 12,
        height: 40,
    },
    aiFieldInput: {
        flex: 1,
        fontFamily: FONTS.body,
        fontSize: 12.5,
        color: COLORS.ink,
    },
})
