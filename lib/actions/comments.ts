'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Comment } from '@/lib/types'

export async function getComments(
  targetType: 'gene' | 'mutation',
  targetId: string
): Promise<Comment[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching comments:', error)
    return []
  }

  return data as Comment[]
}

export async function addComment(
  targetType: 'gene' | 'mutation',
  targetId: string,
  content: string,
  userName?: string,
  userEmail?: string
): Promise<{ success: boolean; error?: string; comment?: Comment }> {
  try {
    const supabase = await createClient()

    // Get the current user (optional - anonymous comments allowed)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const insertPayload = {
      target_type: targetType,
      target_id: targetId,
      user_id: user?.id || null,
      user_email: userEmail || user?.email || null,
      user_name: userName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Anonymous',
      content,
    }

    const { data, error } = await supabase
      .from('comments')
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      console.error('Error adding comment:', error)
      return { success: false, error: 'Failed to add comment' }
    }

    // Revalidate the page to show new comment
    if (targetType === 'gene') {
      revalidatePath('/browse/genes')
    } else {
      revalidatePath(`/browse/mutations/${targetId}`)
    }

    return { success: true, comment: data as Comment }
  } catch (error) {
    console.error('Exception adding comment:', error)
    return { success: false, error: 'Exception occurred while adding comment' }
  }
}

export async function deleteComment(
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get the current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { success: false, error: 'You must be logged in to delete a comment' }
  }

  // Delete the comment (RLS will ensure only owner can delete)
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error deleting comment:', error)
    return { success: false, error: 'Failed to delete comment' }
  }

  return { success: true }
}

export async function updateComment(
  commentId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get the current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { success: false, error: 'You must be logged in to edit a comment' }
  }

  const { error } = await supabase
    .from('comments')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', commentId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error updating comment:', error)
    return { success: false, error: 'Failed to update comment' }
  }

  return { success: true }
}
