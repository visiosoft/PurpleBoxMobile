import { View, Text, FlatList, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { leadApi, type Lead } from '../../src/lib/leads'
import { apiError } from '../../src/lib/api'
import { COLORS, FONTS } from '../../src/lib/theme'
import Avatar from '../../src/components/Avatar'
import PressableScale from '../../src/components/PressableScale'
import ScreenHeader from '../../src/components/ScreenHeader'

/**
 * The unassigned queue — real data now (leadApi.list({owner:'unassigned'})).
 * Tapping a lead opens it for a full reassign; a bulk assign-to-rep picker
 * needs a team/users endpoint the mobile app doesn't call yet, so that
 * part of the handoff's Assign screen is Phase 6 work, not this pass.
 */
export default function AssignTab() {
  const router = useRouter()
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['leads-unassigned'],
    queryFn: () => leadApi.list({ owner: 'unassigned', limit: 100 }),
    staleTime: 15_000,
  })

  const leads = data?.data ?? []

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.paper }}>
      <ScreenHeader
        title="Assign"
        right={
          <View style={{ backgroundColor: COLORS.warnTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11.5, color: COLORS.warnInk }}>{leads.length} unassigned</Text>
          </View>
        }
      />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={COLORS.purple600} />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
            <Text style={{ fontFamily: FONTS.body, fontSize: 14, color: COLORS.danger, textAlign: 'center' }}>{apiError(error)}</Text>
            <PressableScale onPress={() => refetch()}>
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: COLORS.purple600 }}>Try again</Text>
            </PressableScale>
          </View>
        ) : leads.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Ionicons name="checkmark-circle-outline" size={40} color={COLORS.faint} />
            <Text style={{ marginTop: 12, fontFamily: FONTS.bodyMedium, fontSize: 15, color: COLORS.muted, textAlign: 'center' }}>
              Every lead has an owner right now.
            </Text>
          </View>
        ) : (
          <FlatList
            data={leads}
            keyExtractor={(l: Lead) => l._id}
            onRefresh={refetch}
            refreshing={isFetching}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => (
              <PressableScale
                onPress={() => router.push(`/leads/${item._id}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, padding: 14 }}
              >
                <Avatar name={item.fullName} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14.5, color: COLORS.ink }} numberOfLines={1}>{item.fullName}</Text>
                  <Text style={{ marginTop: 2, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.muted }} numberOfLines={1}>{item.phone}</Text>
                </View>
                <PressableScale
                  onPress={() => Alert.alert('Assign to a rep', 'Picking a rep to assign to is coming soon — open the lead to assign it manually for now.')}
                  style={{ paddingHorizontal: 12, height: 34, borderRadius: 10, backgroundColor: COLORS.purple50, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: COLORS.purple600 }}>Assign</Text>
                </PressableScale>
              </PressableScale>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  )
}
