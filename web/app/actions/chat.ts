'use server';

import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { authedUserId } from '@/lib/auth/require-user';

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatConversationSummary {
  conversationId: string;
  lastAt: string;
  preview: string;
}

export async function listChatConversations(): Promise<{
  success: boolean;
  conversations?: ChatConversationSummary[];
  error?: string;
}> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('conversation_id, created_at, content, role')
      .eq('user_id', userId)
      .not('conversation_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(400);

    if (error) {
      console.error('[listChatConversations] 查询错误:', error);
      return { success: false, error: '获取会话列表失败' };
    }

    const map = new Map<string, { lastAt: string; preview: string }>();
    for (const row of data ?? []) {
      const cid = row.conversation_id as string | null;
      if (!cid || map.has(cid)) continue;
      const raw = row.content ?? '';
      const preview = raw.length > 72 ? `${raw.slice(0, 72)}…` : raw;
      map.set(cid, { lastAt: row.created_at ?? '', preview: preview || '（空消息）' });
    }

    const conversations: ChatConversationSummary[] = Array.from(map.entries())
      .map(([conversationId, v]) => ({ conversationId, ...v }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

    return { success: true, conversations };
  } catch (error) {
    console.error('[listChatConversations] 异常:', error);
    return { success: false, error: '获取会话列表失败' };
  }
}

export async function getChatHistory(
  conversationId: string,
  limit: number = 50
): Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  try {
    if (!conversationId.trim()) {
      return { success: true, messages: [] };
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[getChatHistory] 查询错误:', error);
      return { success: false, error: '获取历史消息失败' };
    }

    const messages: ChatMessage[] = (data as ChatMessageRow[]).map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content || '',
    }));

    return { success: true, messages };
  } catch (error) {
    console.error('[getChatHistory] 异常:', error);
    return { success: false, error: '获取历史消息失败' };
  }
}

export async function clearChatHistory(
  conversationId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  try {
    let q = supabase.from('chat_messages').delete().eq('user_id', userId);
    if (conversationId?.trim()) {
      q = q.eq('conversation_id', conversationId.trim());
    }
    const { error } = await q;

    if (error) {
      console.error('[clearChatHistory] 清除错误:', error);
      return { success: false, error: '清除历史失败' };
    }

    return { success: true };
  } catch (error) {
    console.error('[clearChatHistory] 异常:', error);
    return { success: false, error: '清除历史失败' };
  }
}
