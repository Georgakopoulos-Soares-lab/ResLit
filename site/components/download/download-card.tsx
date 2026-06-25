"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Download, CheckCircle, Database, FileText } from 'lucide-react'
import { downloadAllGenes, downloadAllMutations, downloadGenesByValidation, downloadMutationsByValidation } from '@/lib/actions/download'
import { cn } from '@/lib/utils'

interface DownloadCardProps {
  title: string
  description: string
  type: 'genes' | 'mutations'
  curatedOnly?: boolean
  validationTier?: string
  count: number
  variant: 'default' | 'confirmed'
}

export function DownloadCard({
  title,
  description,
  type,
  curatedOnly,
  validationTier,
  count,
  variant
}: DownloadCardProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      let result: { csv: string; count: number }

      if (validationTier && type === 'genes') {
        result = await downloadGenesByValidation(validationTier)
      } else if (validationTier && type === 'mutations') {
        result = await downloadMutationsByValidation(validationTier)
      } else if (type === 'genes') {
        result = await downloadAllGenes(curatedOnly ?? false)
      } else {
        result = await downloadAllMutations(curatedOnly ?? false)
      }

      if (result.csv) {
        const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        const suffix = validationTier ? validationTier.toLowerCase() : (curatedOnly ? 'curated' : 'all')
        link.download = `reslit_${type}_${suffix}_${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Download failed:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      variant === 'confirmed' && "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/20"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {type === 'genes' ? (
              <Database className={cn(
                "h-5 w-5",
                variant === 'confirmed' ? "text-emerald-600" : "text-muted-foreground"
              )} />
            ) : (
              <FileText className={cn(
                "h-5 w-5",
                variant === 'confirmed' ? "text-emerald-600" : "text-muted-foreground"
              )} />
            )}
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          {variant === 'confirmed' && (
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          )}
        </div>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {count.toLocaleString()} {type === 'genes' ? 'genes' : 'mutations'}
          </span>
          <Button
            onClick={handleDownload}
            disabled={isDownloading || count === 0}
            size="sm"
            variant="default"
            className={cn(
              variant === 'confirmed'
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {isDownloading ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
