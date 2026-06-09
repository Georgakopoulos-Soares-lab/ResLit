"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Download, CheckCircle, Database, FileText } from 'lucide-react'
import { downloadAllGenes, downloadAllMutations } from '@/lib/actions/download'
import { cn } from '@/lib/utils'

interface DownloadCardProps {
  title: string
  description: string
  type: 'genes' | 'mutations'
  curatedOnly: boolean
  count: number
  variant: 'default' | 'curated'
}

export function DownloadCard({ 
  title, 
  description, 
  type, 
  curatedOnly, 
  count,
  variant 
}: DownloadCardProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const result = type === 'genes' 
        ? await downloadAllGenes(curatedOnly)
        : await downloadAllMutations(curatedOnly)

      if (result.csv) {
        // Create blob and download
        const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `reslit_${type}_${curatedOnly ? 'curated' : 'all'}_${new Date().toISOString().split('T')[0]}.csv`
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
      variant === 'curated' && "border-green-200 bg-green-50/30 dark:border-green-900/50 dark:bg-green-950/20"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {type === 'genes' ? (
              <Database className={cn(
                "h-5 w-5",
                variant === 'curated' ? "text-green-600" : "text-muted-foreground"
              )} />
            ) : (
              <FileText className={cn(
                "h-5 w-5",
                variant === 'curated' ? "text-green-600" : "text-muted-foreground"
              )} />
            )}
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          {variant === 'curated' && (
            <CheckCircle className="h-4 w-4 text-green-600" />
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
            variant={variant === 'curated' ? 'default' : 'secondary'}
            className={cn(
              variant === 'curated' && "bg-green-600 hover:bg-green-700"
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
