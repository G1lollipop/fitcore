'use server';

import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatConversationSummary {
  conversationId: string;
  lastAt: string;
  preview: string;
}

export async function listChatConversations(
  userId: string
): Promise<{ success: boolean; conversations?: ChatConversationSummary[]; error?: string }> {
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
  userId: string,
  conversationId: string,
  limit: number = 50
): Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }> {
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

export async function saveChatMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  conversationId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const insertData: ChatMessageInsert = {
      user_id: userId,
      role,
      content,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    };

    const { data, error } = await supabase
      .from('chat_messages')
      .insert(insertData)
      .select();

    if (error) {
      console.error('[saveChatMessage] 保存错误:', error);
      return { success: false, error: '保存消息失败' };
    }

    console.log('[saveChatMessage] 保存成功, 返回数据:', data);
    return { success: true };
  } catch (error) {
    console.error('[saveChatMessage] 异常:', error);
    return { success: false, error: '保存消息失败' };
  }
}

export async function clearChatHistory(
  userId: string,
  conversationId?: string | null
): Promise<{ success: boolean; error?: string }> {
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
