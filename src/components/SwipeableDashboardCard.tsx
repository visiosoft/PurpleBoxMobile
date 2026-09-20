import React, { useRef, useState, memo } from 'react'
import {
    View,
    Text,
    Animated,
    PanResponder,
    Dimensions,
    StyleSheet,
    TouchableOpacity,
    type GestureResponderEvent,
    type PanResponderGestureState,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS, SHADOWS, avatarStyle } from '../lib/theme'
import { statusMeta } from '../lib/leadStatus'
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
}: DashboardCardProps) {
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
    const meta = leadStatus ? statusMeta(leadStatus) : null

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
                    {/* Header Row of Card */}
                    <View style={styles.headerRow}>
                        <View
                            style={[
                                styles.typeBadge,
                                { backgroundColor: typeConfig.badgeBg, borderColor: typeConfig.borderColor },
                            ]}
                        >
                            <Ionicons name={typeConfig.badgeIcon} size={10} color={typeConfig.badgeText} />
                            <Text style={[styles.typeBadgeText, { color: typeConfig.badgeText }]}>
                                {typeConfig.badgeLabel}
                            </Text>
                        </View>

                        {timeText ? (
                            <View style={styles.timeBadge}>
                                <Ionicons
                                    name={type === 'followup_overdue' ? 'warning-outline' : 'time-outline'}
                                    size={10}
                                    color={type === 'followup_overdue' ? COLORS.danger : COLORS.ink3}
                                />
                                <Text
                                    style={[
                                        styles.timeBadgeText,
                                        type === 'followup_overdue' && { color: COLORS.danger, fontFamily: FONTS.bodyBold },
                                    ]}
                                >
                                    {timeText}
                                </Text>
                            </View>
                        ) : null}
                    </View>

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
                                    {meta && (
                                        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                                            <Text style={[styles.statusText, { color: meta.text }]}>
                                                {meta.label}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.subRow}>
                                    <Ionicons name="logo-whatsapp" size={10.5} color={COLORS.whatsapp} />
                                    <Text style={styles.phoneText}>
                                        {phone}
                                    </Text>
                                    {subtitle ? (
                                        <>
                                            <Text style={styles.dotSeparator}>•</Text>
                                            <Text style={styles.subtitleText} numberOfLines={1}>
                                                {subtitle}
                                            </Text>
                                        </>
                                    ) : null}
                                </View>
                            </View>
                        </View>

                        {/* Short Last Message or Notes */}
                        {lastMessage ? (
                            <View style={styles.lastMessageBox}>
                                <View style={styles.lastMessageHeader}>
                                    <Ionicons name="chatbubble-ellipses-outline" size={10.5} color={COLORS.whatsapp} />
                                    <Text style={styles.lastMessageLabel}>
                                        {lastMessageMine ? 'You' : 'Latest WhatsApp'}
                                    </Text>
                                </View>
                                <Text style={styles.lastMessageText} numberOfLines={1}>
                                    {lastMessage}
                                </Text>
                            </View>
                        ) : note ? (
                            <View style={styles.noteBox}>
                                <Text style={styles.noteText} numberOfLines={1}>
                                    {note}
                                </Text>
                            </View>
                        ) : null}
                    </TouchableOpacity>

                    {/* Action Footer */}
                    <View style={styles.cardFooter}>
                        <PressableScale
                            onPress={() => triggerAction('right')}
                            style={styles.chatButton}
                        >
                            <Ionicons name="logo-whatsapp" size={13} color="#fff" />
                            <Text style={styles.chatButtonText}>Reply</Text>
                        </PressableScale>

                        <PressableScale
                            onPress={() => onReschedule()}
                            style={styles.rescheduleButton}
                        >
                            <Ionicons name="calendar-outline" size={13} color={COLORS.purple600} />
                            <Text style={styles.rescheduleButtonText}>Reschedule</Text>
                        </PressableScale>

                        {onOpenDetails && (
                            <PressableScale
                                onPress={onOpenDetails}
                                style={styles.detailButton}
                            >
                                <Ionicons name="chevron-forward" size={14} color={COLORS.purple600} />
                            </PressableScale>
                        )}
                    </View>
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
        ...StyleSheet.absoluteFillObject,
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
        padding: 12,
        ...SHADOWS.card,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    typeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
    },
    typeBadgeText: {
        fontFamily: FONTS.bodyBold,
        fontSize: 9.5,
        letterSpacing: 0.2,
    },
    timeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3.5,
        backgroundColor: COLORS.surfaceAlt,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    timeBadgeText: {
        fontFamily: FONTS.bodyMedium,
        fontSize: 10.5,
        color: COLORS.ink3,
    },
    mainPressable: {
        marginBottom: 6,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontFamily: FONTS.display,
        fontSize: 14.5,
    },
    infoCenter: {
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    nameText: {
        fontFamily: FONTS.bodyBold,
        fontSize: 14.5,
        color: COLORS.ink,
        flexShrink: 1,
    },
    statusPill: {
        borderRadius: 5,
        paddingHorizontal: 5,
        paddingVertical: 1.5,
    },
    statusText: {
        fontFamily: FONTS.bodyBold,
        fontSize: 9,
    },
    subRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    phoneText: {
        fontFamily: FONTS.bodyMedium,
        fontSize: 11,
        color: COLORS.ink3,
    },
    dotSeparator: {
        fontSize: 9,
        color: COLORS.ink4,
    },
    subtitleText: {
        fontFamily: FONTS.body,
        fontSize: 11,
        color: COLORS.ink3,
        flex: 1,
    },
    lastMessageBox: {
        marginTop: 6,
        backgroundColor: '#F3FAF5',
        borderRadius: 8,
        paddingVertical: 5,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: 'rgba(37,211,102,0.18)',
    },
    lastMessageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3.5,
        marginBottom: 1,
    },
    lastMessageLabel: {
        fontFamily: FONTS.bodyBold,
        fontSize: 9.5,
        color: COLORS.success,
    },
    lastMessageText: {
        fontFamily: FONTS.body,
        fontSize: 11.5,
        lineHeight: 15,
        color: COLORS.ink2,
    },
    noteBox: {
        marginTop: 6,
        backgroundColor: COLORS.surfaceAlt,
        borderRadius: 8,
        paddingVertical: 4.5,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: 'rgba(20,8,31,0.04)',
    },
    noteText: {
        fontFamily: FONTS.body,
        fontSize: 11,
        lineHeight: 14,
        color: COLORS.ink3,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingTop: 2,
    },
    chatButton: {
        flex: 1.3,
        height: 33,
        borderRadius: 9,
        backgroundColor: COLORS.whatsapp,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        ...SHADOWS.whatsappGlow,
    },
    chatButtonText: {
        fontFamily: FONTS.bodyBold,
        fontSize: 12,
        color: '#fff',
    },
    rescheduleButton: {
        flex: 1.3,
        height: 33,
        borderRadius: 9,
        backgroundColor: COLORS.purple50,
        borderWidth: 1,
        borderColor: COLORS.purple200,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    rescheduleButtonText: {
        fontFamily: FONTS.bodyBold,
        fontSize: 11.5,
        color: COLORS.purple600,
    },
    detailButton: {
        width: 33,
        height: 33,
        borderRadius: 9,
        backgroundColor: COLORS.surfaceAlt,
        borderWidth: 1,
        borderColor: COLORS.line,
        alignItems: 'center',
        justifyContent: 'center',
    },
})
