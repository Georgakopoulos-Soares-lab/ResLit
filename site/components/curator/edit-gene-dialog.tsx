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
import { updateGene } from '@/lib/actions/curator'
import type { AMRGene } from '@/lib/types'

interface EditGeneDialogProps {
  gene: AMRGene
  onSuccess: () => void
}

export function EditGeneDialog({ gene, onSuccess }: EditGeneDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [fields, setFields] = useState({
    gene_name: gene.gene_name ?? '',
    allele: gene.allele ?? '',
    encodes: gene.encodes ?? '',
    mechanism: gene.mechanism ?? '',
    resistance_mechanism_class: gene.resistance_mechanism_class ?? '',
    confers_resistance_to: (gene.confers_resistance_to ?? []).join(', '),
    organisms_tested_in: (gene.organisms_tested_in ?? []).join(', '),
    role_in_paper: gene.role_in_paper ?? '',
    geographic_location: gene.geographic_location ?? '',
    key_findings: gene.key_findings ?? '',
  })

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const splitArr = (val: string) =>
        val.split(',').map((s) => s.trim()).filter(Boolean)

      const updates: Partial<AMRGene> = {
        gene_name: fields.gene_name,
        allele: fields.allele || null,
        encodes: fields.encodes || null,
        mechanism: fields.mechanism || null,
        resistance_mechanism_class: fields.resistance_mechanism_class || null,
        confers_resistance_to: splitArr(fields.confers_resistance_to),
        organisms_tested_in: splitArr(fields.organisms_tested_in),
        role_in_paper: fields.role_in_paper || null,
        geographic_location: fields.geographic_location || null,
        key_findings: fields.key_findings || null,
      }

      const result = await updateGene(gene.id, updates)
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
          <DialogTitle>Edit Gene: {gene.gene_name}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[70vh] pr-1">
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="eg-gene_name">Gene Name</Label>
              <Input id="eg-gene_name" value={fields.gene_name} onChange={set('gene_name')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eg-allele">Allele</Label>
              <Input id="eg-allele" value={fields.allele} onChange={set('allele')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eg-encodes">Encodes</Label>
              <Input id="eg-encodes" value={fields.encodes} onChange={set('encodes')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eg-mechanism">Mechanism</Label>
              <Input id="eg-mechanism" value={fields.mechanism} onChange={set('mechanism')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eg-resistance_mechanism_class">Resistance Mechanism Class</Label>
              <Input id="eg-resistance_mechanism_class" value={fields.resistance_mechanism_class} onChange={set('resistance_mechanism_class')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eg-role_in_paper">Role in Paper</Label>
              <Input id="eg-role_in_paper" value={fields.role_in_paper} onChange={set('role_in_paper')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eg-confers_resistance_to">Confers Resistance To (comma-separated)</Label>
              <Input id="eg-confers_resistance_to" value={fields.confers_resistance_to} onChange={set('confers_resistance_to')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eg-organisms_tested_in">Organisms Tested In (comma-separated)</Label>
              <Input id="eg-organisms_tested_in" value={fields.organisms_tested_in} onChange={set('organisms_tested_in')} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="eg-geographic_location">Geographic Location</Label>
              <Input id="eg-geographic_location" value={fields.geographic_location} onChange={set('geographic_location')} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="eg-key_findings">Key Findings</Label>
              <Textarea id="eg-key_findings" value={fields.key_findings} onChange={set('key_findings')} rows={4} />
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
