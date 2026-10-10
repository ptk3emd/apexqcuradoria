import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Question, QuestionComment, AuditLogItem, CuratorPresence } from '../types/question';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConnected: boolean;
}

const STORAGE_KEY_SUPABASE = 'apexmed_supabase_config';
const BROADCAST_CHANNEL_NAME = 'apexmed_curadoria_realtime_bus';

// Safe broadcast channel for cross-tab local realtime synchronization
let localBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    localBroadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
} catch (e) {
  console.warn('BroadcastChannel not supported in this environment', e);
}

let activeSupabaseClient: SupabaseClient | null = null;

export function getStoredSupabaseConfig(): SupabaseConfig {
  if (typeof window === 'undefined') {
    return { url: '', anonKey: '', isConnected: false };
  }

  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  try {
    const raw = localStorage.getItem(STORAGE_KEY_SUPABASE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.url && parsed.anonKey) {
        return {
          url: parsed.url,
          anonKey: parsed.anonKey,
          isConnected: true,
        };
      }
    }
  } catch {
    // ignore
  }

  if (envUrl && envKey) {
    return {
      url: envUrl,
      anonKey: envKey,
      isConnected: true,
    };
  }

  return { url: '', anonKey: '', isConnected: false };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    STORAGE_KEY_SUPABASE,
    JSON.stringify({ url: url.trim(), anonKey: anonKey.trim(), isConnected: Boolean(url && anonKey) })
  );
  activeSupabaseClient = null; // Reset so next getClient() recreates it
}

export function clearSupabaseConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_SUPABASE);
  activeSupabaseClient = null;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (activeSupabaseClient) return activeSupabaseClient;

  const config = getStoredSupabaseConfig();
  if (config.url && config.anonKey) {
    try {
      activeSupabaseClient = createClient(config.url, config.anonKey, {
        auth: { persistSession: true },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
      return activeSupabaseClient;
    } catch (e) {
      console.error('Error creating Supabase client:', e);
      return null;
    }
  }

  return null;
}

/**
 * Tests connection to configured Supabase instance
 */
export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const client = createClient(url.trim(), anonKey.trim());
    // Attempt a light ping or check auth session
    const { error } = await client.from('questoes').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') {
        // Table does not exist yet, but credentials ARE valid!
        return {
          success: true,
          message: 'Conectado ao Supabase com sucesso! (Observação: a tabela "questoes" ainda não foi criada. Utilize a aba Script DDL para criá-la).',
        };
      }
      return { success: false, message: `Erro ao conectar: ${error.message} (${error.code || ''})` };
    }
    return { success: true, message: 'Conexão com o Supabase estabelecida com sucesso!' };
  } catch (err: any) {
    return { success: false, message: `Falha na requisição: ${err.message || String(err)}` };
  }
}

/**
 * Message types for cross-client real-time synchronization
 */
export type RealtimeSyncEvent =
  | { type: 'QUESTION_UPDATED'; payload: Question; curatorName: string }
  | { type: 'STATUS_CHANGED'; payload: { id: string; status: Question['status']; curatorName: string; notas?: string } }
  | { type: 'BATCH_ASSIGNED'; payload: { questionIds: string[]; curatorId: string; curatorName: string } }
  | { type: 'NEW_COMMENT'; payload: QuestionComment }
  | { type: 'PRESENCE_PING'; payload: CuratorPresence }
  | { type: 'BULK_IMPORT'; payload: Question[] };

/**
 * Broadcasts an event to other active curators (via Supabase Realtime Channel and/or Local BroadcastChannel)
 */
export function broadcastRealtimeEvent(event: RealtimeSyncEvent): void {
  // 1. Send via local BroadcastChannel (instant for any other tab in the same browser)
  if (localBroadcastChannel) {
    try {
      localBroadcastChannel.postMessage(event);
    } catch (e) {
      console.warn('Broadcast error', e);
    }
  }

  // 2. Send via Supabase Realtime Broadcast if connected
  const client = getSupabaseClient();
  if (client) {
    try {
      const channel = client.channel('apexmed_curadoria');
      channel.send({
        type: 'broadcast',
        event: event.type,
        payload: event,
      });
    } catch (e) {
      console.warn('Supabase realtime broadcast error:', e);
    }
  }
}

/**
 * Subscribes to real-time events from both Local BroadcastChannel and Supabase Realtime
 */
export function subscribeToRealtimeEvents(onEvent: (event: RealtimeSyncEvent) => void): () => void {
  // Handler for local broadcast
  const handleLocalMessage = (msg: MessageEvent) => {
    if (msg.data && typeof msg.data === 'object' && 'type' in msg.data) {
      onEvent(msg.data as RealtimeSyncEvent);
    }
  };

  if (localBroadcastChannel) {
    localBroadcastChannel.addEventListener('message', handleLocalMessage);
  }

  // Supabase Realtime Channel
  const client = getSupabaseClient();
  let supabaseChannel: any = null;

  if (client) {
    try {
      supabaseChannel = client.channel('apexmed_curadoria');
      supabaseChannel
        .on('broadcast', { event: '*' }, (payload: any) => {
          if (payload?.payload?.payload) {
            onEvent(payload.payload.payload as RealtimeSyncEvent);
          } else if (payload?.payload) {
            onEvent(payload.payload as RealtimeSyncEvent);
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Error setting up Supabase subscription', e);
    }
  }

  return () => {
    if (localBroadcastChannel) {
      localBroadcastChannel.removeEventListener('message', handleLocalMessage);
    }
    if (supabaseChannel && client) {
      client.removeChannel(supabaseChannel);
    }
  };
}
