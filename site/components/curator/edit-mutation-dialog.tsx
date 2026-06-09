'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { updateMutation } from '@/lib/actions/curator'
import type { AMRMutation } from '@/lib/types'

interface EditMutationDialogProps {
  mutation: AMRMutation
  onSuccess: () => void
}

export function EditMutationDialog({ mutation, onSuccess }: EditMutationDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [fields, setFields] = useState({
    gene_name: mutation.gene_name ?? '',
    nucleotide_change: mutation.nucleotide_change ?? '',
    protein_change: mutation.protein_change ?? '',
    mutation_type: mutation.mutation_type ?? '',
    effect_on_function: mutation.effect_on_function ?? '',
    confers_resistance_to: (mutation.confers_resistance_to ?? []).join(', '),
    organisms_observed_in: (mutation.organisms_observed_in ?? []).join(', '),
    country: mutation.country ?? '',
    validated_by: mutation.validated_by ?? '',
    origin: mutation.origin ?? '',
    key_findings: mutation.key_findings ?? '',
  })

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const splitArr = (val: string) =>
        val.split(',').map((s) => s.trim()).filter(Boolean)

      const updates: Partial<AMRMutation> = {
        gene_name: fields.gene_name,
        nucleotide_change: fields.nucleotide_change,
        protein_change: fields.protein_change || null,
        mutation_type: fields.mutation_type || null,
        effect_on_function: fields.effect_on_function || null,
        confers_resistance_to: splitArr(fields.confers_resistance_to),
        organisms_observed_in: splitArr(fields.organisms_observed_in),
        country: fields.country || null,
        validated_by: fields.validated_by || null,
        origin: fields.origin || null,
        key_findings: fields.key_findings || null,
      }

      const result = await updateMutation(mutation.id, updates)
      if (result.success) {
        setOpen(false)
        onSuccess()
      } else {
        setError(result.error ?? 'An error occurred')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
          </svg>
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Mutation: {mutation.mutation_name ?? mutation.nucleotide_change}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[70vh] pr-1">
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="em-gene_name">Gene Name</Label>
              <Input id="em-gene_name" value={fields.gene_name} onChange={set('gene_name')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="em-nucleotide_change">Nucleotide Change</Label>
              <Input id="em-nucleotide_change" value={fields.nucleotide_change} onChange={set('nucleotide_change')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="em-protein_change">Protein Change</Label>
              <Input id="em-protein_change" value={fields.protein_change} onChange={set('protein_change')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="em-mutation_type">Mutation Type</Label>
              <Input id="em-mutation_type" value={fields.mutation_type} onChange={set('mutation_type')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="em-effect_on_function">Effect on Function</Label>
              <Input id="em-effect_on_function" value={fields.effect_on_function} onChange={set('effect_on_function')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="em-country">Country</Label>
              <Input id="em-country" value={fields.country} onChange={set('country')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="em-validated_by">Validated By</Label>
              <Input id="em-validated_by" value={fields.validated_by} onChange={set('validated_by')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="em-origin">Origin</Label>
              <Input id="em-origin" value={fields.origin} onChange={set('origin')} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="em-confers_resistance_to">Confers Resistance To (comma-separated)</Label>
              <Input id="em-confers_resistance_to" value={fields.confers_resistance_to} onChange={set('confers_resistance_to')} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="em-organisms_observed_in">Organisms Observed In (comma-separated)</Label>
              <Input id="em-organisms_observed_in" value={fields.organisms_observed_in} onChange={set('organisms_observed_in')} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="em-key_findings">Key Findings</Label>
              <Textarea id="em-key_findings" value={fields.key_findings} onChange={set('key_findings')} rows={4} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? <Spinner className="h-4 w-4" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
