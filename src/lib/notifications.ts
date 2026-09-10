import { useQuery } from '@tanstack/react-query'
import { whatsappApi } from './whatsapp'
import { leadApi } from './leads'

/**
 * What the bell counts — real signals a rep would actually act on, not a
 * decorative badge. "Waiting" chats and today/overdue follow-ups are the
 * same numbers the web console's own owner tabs and follow-up queue are
 * built from; nothing new on the server, just read together here.
 */
export function useNotifications() {
  const { data: wa } = useQuery({
    queryKey: ['notif-wa-waiting'],
    queryFn: () => whatsappApi.conversations({ owner: 'waiting', limit: 1 }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const { data: fu } = useQuery({
    queryKey: ['notif-followups'],
    queryFn: () => leadApi.followUps(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const waiting = wa?.ownerCounts?.waiting ?? wa?.matched ?? 0
  const overdue = fu?.overdue?.length ?? 0
  const dueToday = fu?.today?.length ?? 0

  return {
    count: waiting + overdue + dueToday,
    waiting,
    overdue,
    dueToday,
  }
}
