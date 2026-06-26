export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getValidationTiers, getMutationValidationTiers } = await import('@/lib/actions/browse')
    const { getCachedFilterOptions } = await import('@/lib/browse-cache')

    // Warm all caches in the background so the first user request is fast
    Promise.all([
      getValidationTiers(),
      getMutationValidationTiers(),
      getCachedFilterOptions(),
    ]).then(() => {
      console.log('Cache warm-up complete')
    }).catch((err) => {
      console.error('Cache warm-up failed:', err)
    })
  }
}
