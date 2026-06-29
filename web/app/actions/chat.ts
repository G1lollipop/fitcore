'use server';

import { supabase } from '@/lib/supabaseClient';
import { Database, Json } from '@/lib/database.types';
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
      console.error('[listChatConversations] Query error:', error);
      return { success: false, error: 'Failed to fetch conversation list' };
    }

    const map = new Map<string, { lastAt: string; preview: string }>();
    for (const row of data ?? []) {
      const cid = row.conversation_id as string | null;
      if (!cid || map.has(cid)) continue;
      const raw = row.content ?? '';
      const preview = raw.length > 72 ? `${raw.slice(0, 72)}…` : raw;
      map.set(cid, { lastAt: row.created_at ?? '', preview: preview || '(empty message)' });
    }

    const conversations: ChatConversationSummary[] = Array.from(map.entries())
      .map(([conversationId, v]) => ({ conversationId, ...v }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

    return { success: true, conversations };
  } catch (error) {
    console.error('[listChatConversations] Error:', error);
    return { success: false, error: 'Failed to fetch conversation list' };
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
      console.error('[getChatHistory] Query error:', error);
      return { success: false, error: 'Failed to fetch message history' };
    }

    const messages: ChatMessage[] = (data as ChatMessageRow[]).map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content || '',
    }));

    return { success: true, messages };
  } catch (error) {
    console.error('[getChatHistory] Error:', error);
    return { success: false, error: 'Failed to fetch message history' };
  }
}

export interface SubmitFeedbackInput {
  /** chat_messages.id of the assistant reply being rated. */
  messageId: string;
  /** +1 thumbs up, -1 thumbs down. */
  rating: 1 | -1;
  /** Citations snapshot from the rated answer (for the training flywheel). */
  citations?: unknown;
}

/**
 * Record a thumbs up / down on an assistant message.
 *
 * The message id is verified to belong to the caller (never trust a client id),
 * and the prompting user turn is resolved server-side as the training `query`.
 * Upserts so a user toggling the rating overwrites the previous one. Feeds
 * `rag/training/export_feedback.py` (hard-negative mining + eval-set growth).
 */
export async function submitMessageFeedback(
  input: SubmitFeedbackInput
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;

  const messageId = input.messageId?.trim();
  if (!messageId) return { success: false, error: 'messageId is required' };
  if (input.rating !== 1 && input.rating !== -1) {
    return { success: false, error: 'rating must be 1 or -1' };
  }

  try {
    // Verify the assistant message belongs to this user before recording.
    const { data: msg, error: msgErr } = await supabase
      .from('chat_messages')
      .select('id, content, conversation_id, created_at, role')
      .eq('id', messageId)
      .eq('user_id', userId)
      .maybeSingle();

    if (msgErr) {
      console.error('[submitMessageFeedback] lookup error:', msgErr);
      return { success: false, error: 'Failed to record feedback' };
    }
    if (!msg || msg.role !== 'assistant') {
      return { success: false, error: 'Message not found' };
    }

    // Resolve the user turn that prompted this answer (the training query):
    // the most recent user message before it in the same conversation.
    let query: string | null = null;
    if (msg.conversation_id) {
      const { data: prior } = await supabase
        .from('chat_messages')
        .select('content, created_at')
        .eq('user_id', userId)
        .eq('conversation_id', msg.conversation_id)
        .eq('role', 'user')
        .lt('created_at', msg.created_at)
        .order('created_at', { ascending: false })
        .limit(1);
      query = prior?.[0]?.content ?? null;
    }

    const { error } = await supabase.from('chat_message_feedback').upsert(
      {
        user_id: userId,
        message_id: messageId,
        conversation_id: msg.conversation_id,
        rating: input.rating,
        query,
        answer: msg.content,
        citations: (input.citations ?? []) as Json,
      },
      { onConflict: 'user_id,message_id' }
    );

    if (error) {
      console.error('[submitMessageFeedback] upsert error:', error);
      return { success: false, error: 'Failed to record feedback' };
    }
    return { success: true };
  } catch (error) {
    console.error('[submitMessageFeedback] Error:', error);
    return { success: false, error: 'Failed to record feedback' };
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
      console.error('[clearChatHistory] Clear error:', error);
      return { success: false, error: 'Failed to clear history' };
    }

    return { success: true };
  } catch (error) {
    console.error('[clearChatHistory] Error:', error);
    return { success: false, error: 'Failed to clear history' };
  }
}
