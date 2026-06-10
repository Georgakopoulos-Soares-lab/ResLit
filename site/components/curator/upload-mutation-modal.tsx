'use client'

import { useState } from 'react'
import { uploadMutation } from '@/lib/actions/curator-upload'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'

const MUTATION_FIELDS = [
  'gene_name',
  'notation',
  'nucleotide_change',
  'protein_change',
  'nucleotide_position',
  'protein_position',
  'paper_pmid',
  'confers_resistance_to',
  'organisms_observed_in',
  'effect_on_function',
  'mutation_type',
  'title_pmid',
  'year_pmid',
  'key_findings',
]

const FIELD_LABELS: Record<string, string> = {
  gene_name: 'Gene Name *',
  notation: 'Notation',
  nucleotide_change: 'Nucleotide Change *',
  protein_change: 'Protein Change',
  nucleotide_position: 'Nucleotide Position *',
  protein_position: 'Protein Position *',
  paper_pmid: 'PMID *',
  confers_resistance_to: 'Confers Resistance To (comma-separated)',
  organisms_observed_in: 'Organisms Observed In (comma-separated)',
  effect_on_function: 'Effect on Function',
  mutation_type: 'Mutation Type',
  title_pmid: 'Title PMID',
  year_pmid: 'Year PMID',
  key_findings: 'Key Findings',
}

export function UploadMutationModal() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [tempValue, setTempValue] = useState('')

  const [formData, setFormData] = useState<Record<string, string>>(
    MUTATION_FIELDS.reduce((acc, field) => ({ ...acc, [field]: '' }), {})
  )

  const startEditing = (field: string) => {
    setEditingCell(field)
    setTempValue(formData[field])
  }

  const saveEdit = (field: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: tempValue,
    }))
    setEditingCell(null)
    setTempValue('')
  }

  const cancelEdit = () => {
    setEditingCell(null)
    setTempValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, field: string) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      saveEdit(field)
    }
    if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.gene_name.trim()) {
      setError('Gene Name is required')
      return
    }
    if (!formData.nucleotide_change.trim() && !formData.protein_change.trim()) {
      setError('Either Nucleotide Change or Protein Change is required')
      return
    }
    if (!formData.nucleotide_position.trim() && !formData.protein_position.trim()) {
      setError('Either Nucleotide Position or Protein Position is required')
      return
    }
    if (!formData.paper_pmid.trim()) {
      setError('PMID is required')
      return
    }

    setError(null)
    setSuccess(false)
    setLoading(true)

    const positionParts = [
      formData.nucleotide_position.trim() ? `nt:${formData.nucleotide_position.trim()}` : '',
      formData.protein_position.trim() ? `aa:${formData.protein_position.trim()}` : '',
    ].filter(Boolean)

    try {
      const result = await uploadMutation({
        gene_name: formData.gene_name,
        notation: formData.notation || null,
        nucleotide_change: formData.nucleotide_change || '',
        protein_change: formData.protein_change || null,
        position_in_molecule: positionParts.length > 0 ? positionParts.join(', ') : null,
        paper_pmid: formData.paper_pmid || null,
        confers_resistance_to: formData.confers_resistance_to
          ? formData.confers_resistance_to.split(',').map((s) => s.trim())
          : null,
        organisms_observed_in: formData.organisms_observed_in
          ? formData.organisms_observed_in.split(',').map((s) => s.trim())
          : null,
        effect_on_function: formData.effect_on_function || null,
        mutation_type: formData.mutation_type || null,
        key_findings: formData.key_findings || null,
        title_pmid: formData.title_pmid || null,
        year_pmid: formData.year_pmid ? parseInt(formData.year_pmid) : null,
      })

      if (!result.success) {
        setError(result.error || 'Failed to upload mutation')
        return
      }

      setSuccess(true)
      setFormData(MUTATION_FIELDS.reduce((acc, field) => ({ ...acc, [field]: '' }), {}))

      setTimeout(() => {
        setOpen(false)
      }, 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Upload Mutation</Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-[90vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload AMR Mutation</DialogTitle>
          <DialogDescription>
            Click on any cell to edit. Press Ctrl+Enter or click away to save. Gene Name, PMID, and at least one of Nucleotide/Protein Change and Position are required.
          </DialogDescription>
        </DialogHeader>

        {success && (
          <Alert>
            <AlertDescription>Mutation uploaded successfully!</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm table-layout-fixed">
              <tbody>
                {MUTATION_FIELDS.map((field) => (
                  <tr
                    key={field}
                    className="border-b last:border-b-0 hover:bg-slate-50 transition-colors"
                  >
                    <td className="bg-slate-100 font-medium px-4 py-3 w-64 text-xs uppercase text-slate-700 flex-shrink-0 break-words whitespace-normal">
                      {FIELD_LABELS[field]}
                    </td>
                    <td
                      className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors min-w-0 max-w-lg"
                      style={{wordBreak: 'break-all', overflowWrap: 'break-word'}}
                      onClick={() => startEditing(field)}
                    >
                      {editingCell === field ? (
                        <div className="flex gap-2 items-start">
                          {field === 'effect_on_function' || field === 'key_findings' ? (
                            <textarea
                              autoFocus
                              value={tempValue}
                              onChange={(e) => setTempValue(e.target.value)}
                              onBlur={() => saveEdit(field)}
                              onKeyDown={(e) => handleKeyDown(e, field)}
                              className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 break-words whitespace-normal resize-none w-full overflow-wrap break-word"
                              rows={4}
                            />
                          ) : (
                            <input
                              autoFocus
                              type="text"
                              value={tempValue}
                              onChange={(e) => setTempValue(e.target.value)}
                              onBlur={() => saveEdit(field)}
                              onKeyDown={(e) => handleKeyDown(e, field)}
                              className="flex-1 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full break-words overflow-wrap break-word"
                            />
                          )}
                          <span className="text-xs text-slate-500 whitespace-nowrap">
                            Ctrl+Enter or click away to save
                          </span>
                        </div>
                      ) : (
                        <div className="text-slate-700 min-h-6 w-full" style={{wordBreak: 'break-all', overflowWrap: 'break-word'}}>
                          {formData[field] ? (
                            <span>{formData[field]}</span>
                          ) : (
                            <span className="text-slate-400 italic">—</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false)
                setError(null)
                setSuccess(false)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={
              loading ||
              !formData.gene_name.trim() ||
              (!formData.nucleotide_change.trim() && !formData.protein_change.trim()) ||
              (!formData.nucleotide_position.trim() && !formData.protein_position.trim()) ||
              !formData.paper_pmid.trim()
            }>
              {loading ? 'Uploading...' : 'Upload Mutation'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
