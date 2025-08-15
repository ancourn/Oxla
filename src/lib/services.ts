import { startTokenCleanup } from '@/lib/token-cleanup'

// This will be called when the Next.js server starts
export async function initializeServices() {
  try {
    // Start token cleanup job
    await startTokenCleanup()
    
    console.log('Services initialized successfully')
  } catch (error) {
    console.error('Error initializing services:', error)
  }
}