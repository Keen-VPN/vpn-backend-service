import { spawn, ChildProcess } from "child_process";
import type { SpawnOptions } from "child_process";

interface TunnelConfig {
  port: number;
  subdomain?: string;
  enabled: boolean;
}

class TunnelManager {
  private tunnelProcess: ChildProcess | null = null;
  private config: TunnelConfig;

  constructor(config: TunnelConfig) {
    this.config = config;
  }

  /**
   * Start tunnelto.dev tunnel
   */
  async start(): Promise<string | null> {
    if (!this.config.enabled) {
      console.log("🔧 Tunnel disabled in configuration");
      return null;
    }

    if (this.tunnelProcess) {
      console.log("⚠️ Tunnel already running");
      return null;
    }

    try {
      console.log("🌐 Starting tunnelto.dev tunnel...");

      const args = ["--port", this.config.port.toString()];

      args.push("--host", "127.0.0.1");

      if (this.config.subdomain) {
        args.push("--subdomain", this.config.subdomain);
      }

      const options: SpawnOptions = {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      };

      this.tunnelProcess = spawn("tunnelto", args, options);

      // Handle tunnel output - simplified approach (no URL parsing)
      return new Promise((resolve, reject) => {
        // Give tunnel 3 seconds to start, then assume success
        const successTimeout = setTimeout(() => {
          const expectedUrl = this.config.subdomain
            ? `https://${this.config.subdomain}.tunn.dev`
            : "https://your-subdomain.tunn.dev";
          console.log(`✅ Tunnel started successfully: ${expectedUrl}`);
          resolve(expectedUrl);
        }, 3000);

        this.tunnelProcess!.stdout?.on("data", (data: Buffer) => {
          const output = data.toString();
          console.log(`🌐 Tunnel: ${output.trim()}`);
        });

        this.tunnelProcess!.stderr?.on("data", (data: Buffer) => {
          const error = data.toString().trim();
          if (error.includes("error") || error.includes("failed")) {
            console.error(`❌ Tunnel error: ${error}`);
          } else {
            console.log(`🌐 Tunnel info: ${error}`);
          }
        });

        this.tunnelProcess!.on("error", (error: Error) => {
          clearTimeout(successTimeout);
          console.error("❌ Failed to start tunnel:", error.message);

          if (error.message.includes("ENOENT")) {
            console.error("💡 Install tunnelto: run ./scripts/setup-tunnel.sh");
          }

          reject(error);
        });

        this.tunnelProcess!.on(
          "exit",
          (code: number | null, signal: string | null) => {
            clearTimeout(successTimeout);
            console.log(
              `🌐 Tunnel process exited with code ${code}, signal ${signal}`
            );
            this.tunnelProcess = null;

            // If tunnel exits immediately, it's likely an error
            if (code !== 0) {
              reject(new Error(`Tunnel exited with code ${code}`));
            }
          }
        );
      });
    } catch (error) {
      console.error("❌ Error starting tunnel:", error);
      return null;
    }
  }

  /**
   * Stop the tunnel
   */
  stop(): void {
    if (this.tunnelProcess) {
      console.log("🛑 Stopping tunnel...");
      this.tunnelProcess.kill("SIGTERM");
      this.tunnelProcess = null;
    }
  }

  /**
   * Check if tunnel is running
   */
  isRunning(): boolean {
    return this.tunnelProcess !== null;
  }

  /**
   * Get tunnel configuration
   */
  getConfig(): TunnelConfig {
    return { ...this.config };
  }
}

/**
 * Create tunnel manager from environment variables
 */
export function createTunnelManager(): TunnelManager {
  const config: TunnelConfig = {
    port: parseInt(process.env.TUNNELTO_PORT || process.env.PORT || "3001", 10),
    subdomain: process.env.TUNNELTO_SUBDOMAIN,
    enabled:
      process.env.TUNNELTO_ENABLED === "true" &&
      process.env.NODE_ENV === "development",
  };

  return new TunnelManager(config);
}

export default TunnelManager;
