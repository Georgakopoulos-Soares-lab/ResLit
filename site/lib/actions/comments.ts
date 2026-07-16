'use server'

import { eq, and, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { comments } from '@/lib/db/schema'
import { toSnakeCase } from '@/lib/db/helpers'
import { getCurrentCurator } from '@/lib/actions/curator'
import type { Comment } from '@/lib/types'

export async function getComments(targetType: 'gene' | 'mutation', targetId: string): Promise<Comment[]> {
  try {
    const rows = await db
      .select()
      .from(comments)
      .where(and(eq(comments.targetType, targetType), eq(comments.targetId, targetId)))
      .orderBy(desc(comments.createdAt))

    return rows.map((r) => toSnakeCase(r)) as unknown as Comment[]
  } catch (error) {
    console.error('Error fetching comments:', error)
    return []
  }
}

export async function addComment(
  targetType: 'gene' | 'mutation',
  targetId: string,
  content: string,
  userName?: string,
  userEmail?: string
): Promise<{ success: boolean; error?: string; comment?: Comment }> {
  try {
    const curator = await getCurrentCurator()

    const [row] = await db
      .insert(comments)
      .values({
        targetType,
        targetId,
        userId: curator?.id ?? null,
        userEmail: userEmail || curator?.email || null,
        userName: userName || curator?.name || curator?.email?.split('@')[0] || 'Anonymous',
        content,
      })
      .returning()

    if (targetType === 'gene') {
      revalidatePath('/browse/genes')
    } else {
      revalidatePath(`/browse/mutations/${targetId}`)
    }

    return { success: true, comment: toSnakeCase(row) as unknown as Comment }
  } catch (error) {
    console.error('Exception adding comment:', error)
    return { success: false, error: 'Failed to add comment' }
  }
}

export async function deleteComment(commentId: string): Promise<{ success: boolean; error?: string }> {
  const curator = await getCurrentCurator()
  if (!curator) {
    return { success: false, error: 'You must be logged in to delete a comment' }
  }

  try {
    await db.delete(comments).where(and(eq(comments.id, commentId), eq(comments.userId, curator.id)))
    return { success: true }
  } catch (error) {
    console.error('Error deleting comment:', error)
    return { success: false, error: 'Failed to delete comment' }
  }
}

export async function updateComment(commentId: string, content: string): Promise<{ success: boolean; error?: string }> {
  const curator = await getCurrentCurator()
  if (!curator) {
    return { success: false, error: 'You must be logged in to edit a comment' }
  }

  try {
    await db
      .update(comments)
      .set({ content })
      .where(and(eq(comments.id, commentId), eq(comments.userId, curator.id)))
    return { success: true }
  } catch (error) {
    console.error('Error updating comment:', error)
    return { success: false, error: 'Failed to update comment' }
  }
}
