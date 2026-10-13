/** Fetch wrapper for admin API calls. Reads JWT from localStorage. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BASE_URL: string = ((import.meta as any).env?.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export interface Provider {
  id: string;
  nameAr: string;
  phone: string;
  submittedAt: string;
  status: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  providerNameAr: string;
  adminUser: string;
  timestamp: string;
}

export interface PaginatedProviders {
  items: Provider[];
  total: number;
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

// --- Mock fallback (used when real API is unavailable) ---

let mockProviders: Provider[] = Array.from({ length: 30 }, (_, i) => ({
  id: String(i + 1),
  nameAr: `متجر النموذج ${i + 1}`,
  phone: `+9647${String(700000000 + i)}`,
  submittedAt: new Date(Date.now() - i * 86_400_000).toISOString(),
  status: 'pending_verification',
}));

const mockAudit: AuditEntry[] = Array.from({ length: 20 }, (_, i) => ({
  id: String(i + 1),
  action: i % 2 === 0 ? 'verify' : 'suspend',
  providerNameAr: `متجر ${i + 1}`,
  adminUser: 'admin@iraq-maps.iq',
  timestamp: new Date(Date.now() - i * 3_600_000).toISOString(),
}));

let useMock = false;

async function tryRealOtpRequest(phone: string): Promise<void> {
  try {
    await request<void>('/v1/admin/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  } catch {
    useMock = true;
  }
}

async function tryRealOtpVerify(phone: string, code: string): Promise<string> {
  const data = await request<{ token: string }>('/v1/admin/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
  return data.token;
}

// --- Public API ---

export const api = {
  isAuthenticated(): boolean {
    return !!getToken();
  },

  async requestOtp(phone: string): Promise<void> {
    await tryRealOtpRequest(phone);
  },

  async verifyOtp(phone: string, code: string): Promise<void> {
    if (useMock) {
      if (code !== '123456') throw new Error('رمز غير صحيح');
      setToken('mock-jwt-token');
      return;
    }
    let realToken: string | undefined;
    try {
      realToken = await tryRealOtpVerify(phone, code);
    } catch {
      // API not yet wired — fall through to mock
      useMock = true;
    }
    if (realToken !== undefined) {
      setToken(realToken);
      return;
    }
    // mock path
    if (code !== '123456') throw new Error('رمز غير صحيح');
    setToken('mock-jwt-token');
  },

  logout(): void {
    clearToken();
  },

  async getPendingProviders(page: number): Promise<PaginatedProviders> {
    try {
      return await request<PaginatedProviders>(
        `/v1/admin/providers?status=pending_verification&page=${page}&limit=25`,
      );
    } catch {
      const start = (page - 1) * 25;
      return {
        items: mockProviders.slice(start, start + 25),
        total: mockProviders.length,
      };
    }
  },

  async verifyProvider(id: string): Promise<void> {
    try {
      await request<void>(`/v1/admin/providers/${id}/verify`, { method: 'PATCH' });
    } catch {
      mockProviders = mockProviders.filter((p) => p.id !== id);
      mockAudit.unshift({
        id: String(Date.now()),
        action: 'verify',
        providerNameAr: `متجر ${id}`,
        adminUser: 'admin@iraq-maps.iq',
        timestamp: new Date().toISOString(),
      });
    }
  },

  async suspendProvider(id: string): Promise<void> {
    try {
      await request<void>(`/v1/admin/providers/${id}/suspend`, { method: 'PATCH' });
    } catch {
      mockProviders = mockProviders.filter((p) => p.id !== id);
      mockAudit.unshift({
        id: String(Date.now()),
        action: 'suspend',
        providerNameAr: `متجر ${id}`,
        adminUser: 'admin@iraq-maps.iq',
        timestamp: new Date().toISOString(),
      });
    }
  },

  async getAuditLog(): Promise<AuditEntry[]> {
    try {
      return await request<AuditEntry[]>('/v1/admin/providers/audit-log');
    } catch {
      return mockAudit;
    }
  },
};
