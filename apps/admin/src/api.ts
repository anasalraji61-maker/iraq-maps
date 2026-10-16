/** Fetch wrapper for admin API calls. Reads JWT from localStorage. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BASE_URL: string = ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ADMIN_KEY: string = ((import.meta as any).env?.VITE_ADMIN_KEY as string | undefined) ?? '';

export interface Provider {
  id: string;
  nameAr: string;
  phone: string;
  submittedAt: string;
  status: string;
  mediaAssetId?: string;
}

export interface ReportedPost {
  id: string;
  body: string;
  authorId: string;
  reportCount: number;
  reasons: string[];
  createdAt: string;
  removedAt: string | null;
}

export interface Metrics {
  totalUsers: number;
  totalProviders: number;
  postsToday: number;
  pendingVerification: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  providerNameAr: string;
  adminUser: string;
  timestamp: string;
}

export interface AdminUser {
  id: string;
  name: string | null;
  locale: string;
  roles: string[];
  createdAt: string;
  postCount?: number;
  inquiryCount?: number;
  suspended?: boolean;
}

export interface DailyMetric {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface DailyTrend {
  users: DailyMetric[];
  posts: DailyMetric[];
  inquiries: DailyMetric[];
}

export interface AssistantUsageEntry {
  date: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

export interface PaginatedProviders {
  items: Provider[];
  total: number;
  nextCursor?: string | null;
}

function getToken(): string | null {
  try {
    return localStorage.getItem('admin_jwt');
  } catch {
    return null;
  }
}

function setToken(token: string): void {
  try {
    localStorage.setItem('admin_jwt', token);
  } catch {
    // ignore
  }
}

function clearToken(): void {
  try {
    localStorage.removeItem('admin_jwt');
  } catch {
    // ignore
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (ADMIN_KEY) headers['x-admin-key'] = ADMIN_KEY;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// Cursor state for provider pagination
let providerCursor: string | null = null;
let providerCursorPage = 1;

// --- Public API ---

export const api = {
  isAuthenticated(): boolean {
    return !!getToken();
  },

  /** Returns the configured admin key (from env var), for direct fetch calls. */
  getAdminKey(): string {
    return ADMIN_KEY;
  },

  async requestOtp(phone: string): Promise<void> {
    await request<void>('/v1/admin/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  async verifyOtp(phone: string, code: string): Promise<void> {
    const data = await request<{ token: string }>('/v1/admin/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
    setToken(data.token);
  },

  logout(): void {
    clearToken();
  },

  async getPendingProviders(page: number): Promise<PaginatedProviders> {
    // Backend uses cursor-based pagination; we track cursor by page progression.
    // Reset cursor when navigating back to page 1.
    if (page === 1) {
      providerCursor = null;
      providerCursorPage = 1;
    }
    const cursorParam = providerCursor ? `&cursor=${encodeURIComponent(providerCursor)}` : '';
    const result = await request<{ items: unknown[]; nextCursor: string | null }>(
      `/v1/admin/providers?status=pending${cursorParam}`,
    );
    if (page > providerCursorPage && result.nextCursor) {
      providerCursor = result.nextCursor;
      providerCursorPage = page;
    }
    // Map AdminProviderView to Provider shape for the UI
    const items: Provider[] = (result.items as Array<Record<string, unknown>>).map((p) => ({
      id: String(p['id'] ?? ''),
      nameAr: String(p['name'] ?? ''),
      phone: String((p['phone'] as { number?: string } | null)?.number ?? ''),
      submittedAt: String(p['submittedAt'] ?? ''),
      status: String(p['status'] ?? ''),
      mediaAssetId: (p['photos'] as string[] | undefined)?.[0] ?? undefined,
    }));
    return { items, total: items.length + (result.nextCursor ? 1 : 0), nextCursor: result.nextCursor };
  },

  async verifyProvider(id: string): Promise<void> {
    await request<unknown>(`/v1/admin/providers/${id}/verify`, { method: 'POST' });
  },

  async suspendProvider(id: string): Promise<void> {
    await request<unknown>(`/v1/admin/providers/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Suspended by admin' }),
    });
  },

  async rejectProvider(id: string, reason: string): Promise<void> {
    await request<unknown>(`/v1/admin/providers/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getMetrics(): Promise<Metrics> {
    return request<Metrics>('/v1/admin/metrics');
  },

  async getReportedPosts(): Promise<ReportedPost[]> {
    return request<ReportedPost[]>('/v1/admin/discover/reported');
  },

  async approvePost(id: string): Promise<void> {
    await request<void>(`/v1/admin/discover/posts/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
  },

  async removePost(id: string): Promise<void> {
    await request<void>(`/v1/admin/discover/posts/${id}/remove`, { method: 'POST', body: JSON.stringify({}) });
  },

  async getDailyTrend(days: number): Promise<DailyTrend> {
    try {
      return await request<DailyTrend>(`/v1/admin/metrics/trend?days=${days}`);
    } catch {
      // Graceful degradation: generate empty placeholder if endpoint not yet live
      const result: DailyMetric[] = Array.from({ length: days }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        return { date: d.toISOString().slice(0, 10), count: 0 };
      });
      return { users: result, posts: [...result], inquiries: [...result] };
    }
  },

  async bulkApprovePost(ids: string[]): Promise<void> {
    await request<void>('/v1/admin/discover/posts/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  async bulkRemovePost(ids: string[]): Promise<void> {
    await request<void>('/v1/admin/discover/posts/bulk-remove', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  async getAuditLog(): Promise<AuditEntry[]> {
    return request<AuditEntry[]>('/v1/admin/providers/audit-log');
  },

  async getAssistantUsage(): Promise<AssistantUsageEntry[]> {
    return request<AssistantUsageEntry[]>('/admin/assistant/usage');
  },

  async searchUsers(q: string): Promise<AdminUser[]> {
    const qs = q.trim().length > 0 ? `?q=${encodeURIComponent(q)}` : '';
    return request<{ items: AdminUser[] }>(`/v1/admin/users${qs}`).then((r) => r.items);
  },

  async suspendUser(id: string): Promise<void> {
    await request<void>(`/v1/admin/users/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason: 'Suspended by admin' }) });
  },

  async unsuspendUser(id: string): Promise<void> {
    await request<void>(`/v1/admin/users/${id}/unsuspend`, { method: 'POST', body: JSON.stringify({}) });
  },

  async getReportedComments(): Promise<ReportedComment[]> {
    return request<ReportedComment[]>('/v1/admin/discover/reported-comments');
  },

  async approveComment(id: string): Promise<void> {
    await request<void>(`/v1/admin/discover/comments/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
  },

  async removeComment(id: string): Promise<void> {
    await request<void>(`/v1/admin/discover/comments/${id}/remove`, { method: 'POST', body: JSON.stringify({}) });
  },

  async getPlaces(q: string): Promise<AdminPlace[]> {
    const qs = q.trim() ? `?q=${encodeURIComponent(q)}` : '';
    return request<{ items: AdminPlace[] }>(`/v1/admin/places${qs}`).then((r) => r.items);
  },

  async updatePlace(id: string, patch: Partial<AdminPlace>): Promise<void> {
    await request<void>(`/v1/admin/places/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  async getAnalyticsOverview(days?: number): Promise<AnalyticsOverview> {
    const qs = days ? `?days=${days}` : '';
    return request<AnalyticsOverview>(`/v1/admin/analytics/overview${qs}`);
  },

  async getAnalyticsFunnel(): Promise<FunnelStep[]> {
    return request<FunnelStep[]>('/v1/admin/analytics/funnels');
  },

  async getAnalyticsRetention(days?: number): Promise<RetentionRow[]> {
    const qs = days ? `?days=${days}` : '';
    return request<RetentionRow[]>(`/v1/admin/analytics/retention${qs}`);
  },

  async exportCsv(entity: 'users' | 'posts' | 'providers', from: string, to: string): Promise<string> {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (ADMIN_KEY) headers['x-admin-key'] = ADMIN_KEY;
    const res = await fetch(
      `${BASE_URL}/v1/admin/export/${entity}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.text();
  },

  // ── User extended actions ────────────────────────────────────────────────

  async banUser(id: string): Promise<void> {
    await request<void>(`/v1/admin/users/${id}/ban`, { method: 'PUT', body: JSON.stringify({ reason: 'Banned by admin' }) });
  },

  // ── Places admin ─────────────────────────────────────────────────────────

  async getPendingPlaces(): Promise<PendingAdminPlace[]> {
    return request<{ items: PendingAdminPlace[] }>('/v1/admin/places/pending').then((r) => r.items);
  },

  async approvePendingPlace(id: string): Promise<void> {
    await request<void>(`/v1/admin/places/${id}/approve`, { method: 'PUT', body: JSON.stringify({}) });
  },

  async rejectPendingPlace(id: string, reason: string): Promise<void> {
    await request<void>(`/v1/admin/places/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) });
  },

  // ── System configuration ──────────────────────────────────────────────────

  async getSystemStats(): Promise<SystemStats> {
    return request<SystemStats>('/v1/admin/system/stats');
  },

  async getQueueStatus(): Promise<{ queues: Record<string, { failed: number }> }> {
    return request<{ queues: Record<string, { failed: number }> }>('/internal/queues/failed');
  },

  async setFeatureFlags(flags: Record<string, boolean>): Promise<void> {
    await request<void>('/v1/admin/system/feature-flags', { method: 'PUT', body: JSON.stringify({ flags }) });
  },

  async setAppVersion(version: { current: string; minSupported: string; forceUpdate: boolean; storeUrl: string }): Promise<void> {
    await request<void>('/v1/admin/system/app-version', { method: 'PUT', body: JSON.stringify(version) });
  },

  async flushCache(target: string): Promise<void> {
    await request<void>(`/v1/admin/system/cache/flush`, { method: 'POST', body: JSON.stringify({ target }) });
  },

  // ── Challenges ────────────────────────────────────────────────────────────

  async approveSubmission(id: string): Promise<void> {
    await request<void>(`/v1/admin/challenges/submissions/${id}/approve`, { method: 'PUT', body: JSON.stringify({}) });
  },

  async rejectSubmission(id: string): Promise<void> {
    await request<void>(`/v1/admin/challenges/submissions/${id}/reject`, { method: 'PUT', body: JSON.stringify({}) });
  },

  async forceCompleteChallenge(challengeId: string, userId: string): Promise<void> {
    await request<void>(`/v1/admin/challenges/${challengeId}/force-complete`, { method: 'POST', body: JSON.stringify({ userId }) });
  },

  /** Alias for getMetrics() */
  async metrics(): Promise<Metrics> {
    return request<Metrics>('/v1/admin/metrics');
  },

  /** Provider verification queue operations */
  adminProviders: {
    async queue(opts: { status?: string }): Promise<{ items: Array<{ id: string; name: string; category: string | null; submittedAt: string | null; status: string; ownerUserId: string | null; suspensionReason: string | null }> }> {
      const status = opts.status ?? 'pending';
      const result = await request<{ items: Array<Record<string, unknown>>; nextCursor: string | null }>(`/v1/admin/providers?status=${encodeURIComponent(status)}`);
      return {
        items: result.items.map((p) => ({
          id: String(p['id'] ?? ''),
          name: String(p['name'] ?? ''),
          category: p['category'] ? String(p['category']) : null,
          submittedAt: p['submittedAt'] ? String(p['submittedAt']) : null,
          status: String(p['status'] ?? ''),
          ownerUserId: p['ownerUserId'] ? String(p['ownerUserId']) : null,
          suspensionReason: p['suspensionReason'] ? String(p['suspensionReason']) : null,
        })),
      };
    },
    async verify(id: string): Promise<void> {
      await request<unknown>(`/v1/admin/providers/${id}/verify`, { method: 'POST' });
    },
    async reject(id: string, opts: { reason?: string }): Promise<void> {
      await request<unknown>(`/v1/admin/providers/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: opts.reason ?? '' }) });
    },
    async suspend(id: string, opts: { reason?: string }): Promise<void> {
      await request<unknown>(`/v1/admin/providers/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason: opts.reason ?? '' }) });
    },
    async get(id: string): Promise<{ audit: unknown[] }> {
      return request<{ audit: unknown[] }>(`/v1/admin/providers/${id}`);
    },
  },
};

// ─── Additional types ─────────────────────────────────────────────────────────

export interface ReportedComment {
  id: string;
  body: string;
  authorId: string;
  postId: string;
  postBody: string;
  reportCount: number;
  reasons: string[];
  createdAt: string;
  removedAt: string | null;
}

export interface AnalyticsOverview {
  dau: number;
  totalEvents: number;
  topEventTypes: { eventType: string; count: number }[];
  eventsByDay: { date: string; count: number }[];
}

export interface FunnelStep {
  step: string;
  eventType: string;
  count: number;
  dropoffRate: number | null;
}

export interface RetentionRow {
  cohortDate: string;
  dayOffset: number;
  retainedCount: number;
}

export interface AdminPlace {
  id: string;
  nameAr: string;
  nameEn: string | null;
  category: string;
  phone: string | null;
  hoursRaw: string | null;
  lat: number;
  lon: number;
}

export interface PendingAdminPlace extends AdminPlace {
  submittedBy?: string;
  submittedAt?: string;
  submissionNote?: string;
}

export interface SystemStats {
  uptime: string;
  apiVersion: string;
  dbVersion: string;
  nodeVersion: string;
  environment: string;
}
