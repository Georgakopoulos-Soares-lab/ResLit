'use client'

import { useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { MessageSquare, Send, Trash2, Edit2, X, Check, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { addComment, deleteComment, updateComment } from '@/lib/actions/comments'
import type { Comment } from '@/lib/types'

interface CommentsSectionProps {
  targetType: 'gene' | 'mutation'
  targetId: string
  initialComments: Comment[]
  currentUserId?: string | null
}

export function CommentsSection({
  targetType,
  targetId,
  initialComments,
  currentUserId,
}: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [newComment, setNewComment] = useState('')
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleAddComment = () => {
    if (!newComment.trim()) return

    startTransition(async () => {
      const result = await addComment(targetType, targetId, newComment.trim(), userName.trim() || 'Anonymous', userEmail.trim())
      if (result.success && result.comment) {
        setComments([result.comment, ...comments])
        setNewComment('')
        setUserName('')
        setUserEmail('')
      }
    })
  }

  const handleDeleteComment = (commentId: string) => {
    startTransition(async () => {
      const result = await deleteComment(commentId)
      if (result.success) {
        setComments(comments.filter((c) => c.id !== commentId))
      }
    })
  }

  const handleEditComment = (comment: Comment) => {
    setEditingId(comment.id)
    setEditContent(comment.content)
  }

  const handleSaveEdit = (commentId: string) => {
    if (!editContent.trim()) return

    startTransition(async () => {
      const result = await updateComment(commentId, editContent.trim())
      if (result.success) {
        setComments(
          comments.map((c) =>
            c.id === commentId ? { ...c, content: editContent.trim(), updated_at: new Date().toISOString() } : c
          )
        )
        setEditingId(null)
        setEditContent('')
      }
    })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const getInitials = (name: string | null) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comments ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new comment */}
        <div className="flex gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback>
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="px-3 py-2 border border-input rounded-md text-sm bg-background"
              />
              <input
                type="email"
                placeholder="Your email (optional)"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                className="px-3 py-2 border border-input rounded-md text-sm bg-background"
              />
            </div>
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleAddComment}
                disabled={isPending || !newComment.trim()}
              >
                <Send className="mr-2 h-4 w-4" />
                Post Comment
              </Button>
            </div>
          </div>
        </div>

        {comments.length > 0 && <Separator />}

        {/* Comments list */}
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {getInitials(comment.user_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {comment.user_name || 'Anonymous'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.created_at), {
                        addSuffix: true,
                      })}
                      {comment.updated_at !== comment.created_at && ' (edited)'}
                    </span>
                  </div>
                  {currentUserId === comment.user_id && editingId !== comment.id && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEditComment(comment)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                {editingId === comment.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[60px] resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                      >
                        <X className="mr-1 h-3 w-3" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(comment.id)}
                        disabled={isPending || !editContent.trim()}
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {comment.content}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No comments yet. Be the first to comment!
          </p>
        )}
      </CardContent>
    </Card>
  )
}
