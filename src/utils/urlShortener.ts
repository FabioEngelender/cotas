import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

export interface ShortLinkData {
  tenantId: string;
  inviteId: string;
  role: 'client' | 'manager' | 'admin';
  isMarketing?: boolean;
  campaignName?: string;
  createdBy?: string;
  createdAt?: any;
}

/**
 * Generate a random 6-character alphanumeric short code
 */
export function generateRandomCode(length = 6): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Creates or retrieves a short link entry in Firestore `/short_links/{code}`
 */
export async function createShortLink(
  tenantId: string, 
  inviteId: string, 
  role: 'client' | 'manager' | 'admin' = 'client',
  isMarketing = false,
  campaignName = ''
): Promise<{ shortCode: string; shortUrl: string; fullUrl: string }> {
  const baseUrl = window.location.origin;
  const fullUrl = `${baseUrl}/register-${role}/${tenantId}/${inviteId}`;

  try {
    const shortCode = generateRandomCode(6);
    const shortRef = doc(db, 'short_links', shortCode);

    await setDoc(shortRef, {
      code: shortCode,
      tenant_id: tenantId,
      invite_id: inviteId,
      role: role,
      is_marketing: isMarketing,
      campaign_name: campaignName,
      created_at: serverTimestamp(),
      full_url: fullUrl
    });

    const shortUrl = `${baseUrl}/r/${shortCode}`;
    return { shortCode, shortUrl, fullUrl };
  } catch (err) {
    console.error('Erro ao salvar short link no Firestore:', err);
    // Fallback to deterministic clean short URL format /r/tenantId/inviteId
    const fallbackShortUrl = `${baseUrl}/r/${tenantId}/${inviteId}`;
    return { shortCode: `${tenantId.slice(0, 5)}_${inviteId.slice(0, 5)}`, shortUrl: fallbackShortUrl, fullUrl };
  }
}

/**
 * Resolve a short code or path parameters to the full target link
 */
export async function resolveShortLink(param1: string, param2?: string): Promise<{ targetUrl: string; role: string } | null> {
  const baseUrl = window.location.origin;

  // Case 1: /r/tenantId/inviteId
  if (param2) {
    const tenantId = param1;
    const inviteId = param2;
    try {
      const inviteRef = doc(db, 'tenants', tenantId, 'invites', inviteId);
      const inviteSnap = await getDoc(inviteRef);
      if (inviteSnap.exists()) {
        const data = inviteSnap.data();
        const role = data.role || 'client';
        return {
          targetUrl: `/register-${role}/${tenantId}/${inviteId}`,
          role
        };
      }
    } catch (e) {
      console.warn("Could not fetch invite doc directly:", e);
    }
    return {
      targetUrl: `/register-client/${tenantId}/${inviteId}`,
      role: 'client'
    };
  }

  // Case 2: /r/shortCode
  const shortCode = param1;
  try {
    const shortSnap = await getDoc(doc(db, 'short_links', shortCode));
    if (shortSnap.exists()) {
      const data = shortSnap.data();
      const role = data.role || 'client';
      const tenantId = data.tenant_id;
      const inviteId = data.invite_id;
      return {
        targetUrl: `/register-${role}/${tenantId}/${inviteId}`,
        role
      };
    }
  } catch (err) {
    console.warn("Error resolving short code from Firestore:", err);
  }

  return null;
}

/**
 * Get external shortened URL via TinyURL API
 */
export async function getTinyUrl(longUrl: string): Promise<string | null> {
  try {
    const apiUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`;
    const response = await fetch(apiUrl);
    if (response.ok) {
      const tiny = await response.text();
      if (tiny && tiny.startsWith('http')) {
        return tiny.trim();
      }
    }
  } catch (e) {
    console.warn("TinyURL API fetch skipped/failed:", e);
  }
  return null;
}
