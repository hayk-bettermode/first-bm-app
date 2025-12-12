import * as cron from "node-cron";
import { Logger } from "@tribeplatform/node-logger";

export class TimeWindowJobService {
  static instance: TimeWindowJobService;
  private logger: Logger;
  private cronTasks: Map<string, string> = new Map();

  constructor() {
    this.logger = new Logger({
      applicationName: process.env.LOGGING_APP_KEY!,
      context: "TimeWindowJobService",
    });
  }

  start(networkId: string, callback: () => void) {
    // Nightly time window shifting job - runs at 00:00 UTC
    const task = cron.createTask("0 0 * * *", callback);

    this.cronTasks.set(networkId, task.id);
    task.start(); // Start the task immediately
    
    this.logger.info("Time window shifting job created for network", { networkId });
  }

  stop(networkId: string) {
    const taskId = this.cronTasks.get(networkId);
    if (taskId) {
      const task = cron.getTask(taskId);
      if (task) {
        task.stop();
        task.destroy();
        this.cronTasks.delete(networkId);
        this.logger.info("Time window shifting job deleted for network", { networkId });
        return;
      }
    }
    this.logger.info("Time window shifting job not found for network", { networkId });
  }

  static getInstance() {
    if (!TimeWindowJobService.instance) {
      TimeWindowJobService.instance = new TimeWindowJobService();
    }
    return TimeWindowJobService.instance;
  }
}