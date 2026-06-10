'use client'

import { useState } from 'react'
import { uploadGene } from '@/lib/actions/curator-upload'
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

const GENE_FIELDS = [
  'gene_name',
  'allele',
  'encodes',
  'mechanism',
  'resistance_mechanism_class',
  'confers_resistance_to',
  'organisms_tested_in',
  'validation_method',
  'role_in_paper',
  'paper_pmid',
  'geographic_location',
  'title_pmid',
  'year_pmid',
  'key_findings',
]

const FIELD_LABELS: Record<string, string> = {
  gene_name: 'Gene Name *',
  allele: 'Allele',
  encodes: 'Encodes *',
  mechanism: 'Mechanism',
  resistance_mechanism_class: 'Resistance Mechanism Class',
  confers_resistance_to: 'Confers Resistance To (comma-separated)',
  organisms_tested_in: 'Organisms Tested In (comma-separated)',
  validation_method: 'Validation Method',
  role_in_paper: 'Role in Paper',
  paper_pmid: 'PMID *',
  geographic_location: 'Geographic Location',
  title_pmid: 'Title PMID',
  year_pmid: 'Year PMID',
  key_findings: 'Key Findings',
}

export function UploadGeneModal() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [tempValue, setTempValue] = useState('')

  const [formData, setFormData] = useState<Record<string, string>>(
    GENE_FIELDS.reduce((acc, field) => ({ ...acc, [field]: '' }), {})
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
    if (!formData.paper_pmid.trim()) {
      setError('PMID is required')
      return
    }
    if (!formData.encodes.trim()) {
      setError('Encodes is required')
      return
    }

    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      const result = await uploadGene({
        gene_name: formData.gene_name,
        allele: formData.allele || null,
        encodes: formData.encodes || null,
        mechanism: formData.mechanism || null,
        resistance_mechanism_class: formData.resistance_mechanism_class || null,
        confers_resistance_to: formData.confers_resistance_to
          ? formData.confers_resistance_to.split(',').map((s) => s.trim())
          : null,
        organisms_tested_in: formData.organisms_tested_in
          ? formData.organisms_tested_in.split(',').map((s) => s.trim())
          : null,
        role_in_paper: formData.role_in_paper || null,
        validation_method: formData.validation_method || null,
        paper_pmid: formData.paper_pmid || null,
        key_findings: formData.key_findings || null,
        geographic_location: formData.geographic_location || null,
        title_pmid: formData.title_pmid || null,
        year_pmid: formData.year_pmid ? parseInt(formData.year_pmid) : null,
      })

      if (!result.success) {
        setError(result.error || 'Failed to upload gene')
        return
      }

      setSuccess(true)
      setFormData(GENE_FIELDS.reduce((acc, field) => ({ ...acc, [field]: '' }), {}))

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
        <Button variant="outline">Upload Gene</Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-[90vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload AMR Gene</DialogTitle>
          <DialogDescription>
            Click on any cell to edit. Press Ctrl+Enter or click away to save. Gene Name, PMID, and Encodes are required.
          </DialogDescription>
        </DialogHeader>

        {success && (
          <Alert>
            <AlertDescription>Gene uploaded successfully!</AlertDescription>
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
                {GENE_FIELDS.map((field) => (
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
                          {field === 'key_findings' ? (
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
            <Button type="submit" disabled={loading || !formData.gene_name.trim() || !formData.paper_pmid.trim() || !formData.encodes.trim()}>
              {loading ? 'Uploading...' : 'Upload Gene'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
