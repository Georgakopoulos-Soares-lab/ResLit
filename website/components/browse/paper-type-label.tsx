/** Paper type (PubMed-derived "Review" / "Research Article"), shown on its
 * own line under a paper title. Renders nothing when the type is unknown. */
export function PaperTypeLabel({ type, className = '' }: { type: string | null | undefined; className?: string }) {
  if (!type) return null
  return <p className={`text-xs text-muted-foreground ${className}`}>{type}</p>
}
