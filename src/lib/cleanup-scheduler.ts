import { runAllCleanupJobs } from '@/lib/cleanup'

// Run cleanup jobs every hour
const CLEANUP_INTERVAL = 60 * 60 * 1000 // 1 hour in milliseconds

export class CleanupScheduler {
  private intervalId: NodeJS.Timeout | null = null

  start() {
    if (this.intervalId) {
      console.log('Cleanup scheduler is already running')
      return
    }

    console.log('Starting cleanup scheduler...')
    
    // Run immediately on start
    this.runCleanup()
    
    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runCleanup()
    }, CLEANUP_INTERVAL)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('Cleanup scheduler stopped')
    }
  }

  private async runCleanup() {
    try {
      console.log('Running scheduled cleanup jobs...')
      await runAllCleanupJobs()
    } catch (error) {
      console.error('Error in scheduled cleanup:', error)
    }
  }
}

// Global scheduler instance
export const cleanupScheduler = new CleanupScheduler()