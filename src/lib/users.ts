import { api } from './api'

/** Mirrors server/src/routes/users.js's GET /users/assignable — any
 *  authenticated user can call it (it's how a rep hands off a task too),
 *  but only admin actually gets a reassign control client-side, matching
 *  PUT /leads/:id's own rule that only a non-rep role may set an
 *  arbitrary owner. */
export type AssignableUser = { _id: string; name: string; email: string; role: string }

export const userApi = {
  assignable: () => api.get<AssignableUser[]>('/users/assignable').then((r) => r.data),
}
