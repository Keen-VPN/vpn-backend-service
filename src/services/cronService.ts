import cron, { ScheduledTask } from "node-cron";
import SessionProcessingService from "../services/sessionProcessing.js";

/**
 * Cron Job Service
 * Manages scheduled tasks for session processing
 */
class CronJobService {
  private sessionProcessingService: SessionProcessingService;
  private jobs: Map<string, ScheduledTask> = new Map();

  constructor() {
    this.sessionProcessingService = new SessionProcessingService();
  }

  /**
   * Start the session processing cron job
   * @param cronExpression - Cron expression (default: daily at 2 AM)
   * @param jobName - Name identifier for the job
   */
  startSessionProcessingJob(
    cronExpression: string = "0 2 * * *", // Daily at 2 AM
    jobName: string = "session-processing"
  ): void {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Stop existing job if it exists
    if (this.jobs.has(jobName)) {
      this.stopJob(jobName);
    }

    console.log(
      `🚀 Starting session processing cron job: ${jobName}`
    );
    console.log(`📅 Schedule: ${cronExpression}`);

    const task = cron.schedule(
      cronExpression,
      async () => {
        console.log(`⏰ Cron job triggered: ${jobName} at ${new Date().toISOString()}`);
        await this.runSessionProcessing();
      },
      {
        timezone: "UTC",
      }
    );

    this.jobs.set(jobName, task);
    console.log(`✅ Cron job started: ${jobName}`);
  }

  /**
   * Stop a specific cron job
   */
  stopJob(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      this.jobs.delete(jobName);
      console.log(`🛑 Stopped cron job: ${jobName}`);
    }
  }

  /**
   * Stop all cron jobs
   */
  stopAll(): void {
    for (const [name, job] of this.jobs.entries()) {
      job.stop();
      console.log(`🛑 Stopped cron job: ${name}`);
    }
    this.jobs.clear();
  }

  /**
   * Run the session processing task
   */
  private async runSessionProcessing(): Promise<void> {
    const startTime = Date.now();
    console.log(`🔄 Starting session processing job...`);

    try {
      // Process all unprocessed sessions
      const stats = await this.sessionProcessingService.processAllUnprocessedSessions();

      const duration = Date.now() - startTime;
      console.log(`✅ Session processing job completed in ${duration}ms`);
      console.log(`📊 Statistics:`);
      console.log(`   - Processed: ${stats.processed}`);
      console.log(`   - Skipped: ${stats.skipped}`);
      console.log(`   - Errors: ${stats.errors}`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `❌ Session processing job failed after ${duration}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Parse cron expression from environment variable
   * Supports formats:
   * - "0 2 * * *" (standard cron)
   * - "24h" (every 24 hours)
   * - "1h" (every 1 hour)
   * - "30m" (every 30 minutes)
   */
  static parseCronExpression(value: string | undefined): string {
    if (!value) {
      return "0 2 * * *";
    }

    // Standard cron expression
    if (cron.validate(value)) {
      return value;
    }

    // Parse interval format (e.g., "24h", "1h", "30m")
    const intervalMatch = value.match(/^(\d+)([hm])$/i);
    if (intervalMatch && intervalMatch[1] && intervalMatch[2]) {
      const amount = parseInt(intervalMatch[1], 10);
      const unit = intervalMatch[2].toLowerCase();

      if (unit === "h") {
        // Hours: Run at minute 0 of every Nth hour
        return `0 */${amount} * * *`;
      } else if (unit === "m") {
        // Minutes: Run every N minutes
        return `*/${amount} * * * *`;
      }
    }

    // Default to daily at 2 AM if invalid
    console.warn(
      `⚠️ Invalid cron expression: ${value}, defaulting to "0 2 * * *"`
    );
    return "0 2 * * *";
  }
}

export default CronJobService;

