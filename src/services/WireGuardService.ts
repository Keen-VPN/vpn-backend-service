import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

interface ServerConfig {
  id: string;
  address: string;
  sshUser: string;
  sshKeyPath: string;
  sshPassword?: string;
  networkInterface: string;
  ipRange: string; // e.g., "10.8.0.0/24"
  serverIP: string; // e.g., "10.8.0.1"
}

interface PeerInfo {
  publicKey: string;
  allowedIPs: string;
  persistentKeepalive?: number;
}

class WireGuardService {
  private servers: Map<string, ServerConfig> = new Map();

  constructor() {
    this.initializeServers();
  }

  private initializeServers() {
    // US East Server (AWS)
    this.servers.set('us-east', {
      id: 'us-east',
      address: '3.235.244.144',
      sshUser: 'ubuntu',
      sshKeyPath: path.join(process.cwd(), '..', 'android', 'keenvpn-us.pem'),
      networkInterface: 'ens5',
      ipRange: '10.8.0.0/24',
      serverIP: '10.8.0.1',
    });

    // Nigerian Server (VPS)
    this.servers.set('ng-lagos', {
      id: 'ng-lagos',
      address: '169.255.57.34',
      sshUser: 'root',
      sshKeyPath: '', // Password-based auth
      sshPassword: process.env.NIGERIA_SERVER_PASSWORD || 'l2T$kR0{8!kz}3ii',
      networkInterface: 'eth0',
      ipRange: '10.8.0.0/24',
      serverIP: '10.8.0.1',
    });
  }

  /**
   * Get next available IP address for a server
   */
  private async getNextAvailableIP(serverId: string): Promise<string> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    // Get list of currently used IPs from server
    const usedIPs = await this.getUsedIPs(serverId);
    
    // Find next available IP in range 10.8.0.2 - 10.8.0.254
    for (let i = 2; i <= 254; i++) {
      const ip = `10.8.0.${i}`;
      if (!usedIPs.includes(ip)) {
        return ip;
      }
    }

    throw new Error(`No available IP addresses in range for server ${serverId}`);
  }

  /**
   * Get list of currently used IP addresses from server
   */
  private async getUsedIPs(serverId: string): Promise<string[]> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      const sshCommand = this.buildSSHCommand(server, 'wg show wg0 dump | tail -n +2 | awk \'{print $4}\'');
      const { stdout } = await execAsync(sshCommand, { timeout: 10000 });
      
      const ips: string[] = [];
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        if (line && line.includes('/')) {
          const parts = line.split('/');
          if (parts.length > 0) {
            const ip = parts[0]?.trim();
            if (ip) ips.push(ip);
          }
        }
      }
      return ips;
    } catch (error) {
      console.error(`Failed to get used IPs for ${serverId}:`, error);
      return [];
    }
  }

  /**
   * Build SSH command for server
   */
  private buildSSHCommand(server: ServerConfig, remoteCommand: string): string {
    if (server.sshPassword) {
      // Use sshpass for password authentication
      // Check if sshpass is available, if not, log warning
      try {
        const sshpassPath = '/usr/local/bin/sshpass';
        const sshpassAlt = '/opt/homebrew/bin/sshpass';
        const sshpassCmd = existsSync(sshpassPath) ? sshpassPath : (existsSync(sshpassAlt) ? sshpassAlt : 'sshpass');
        
        // Escape password for shell
        const escapedPassword = server.sshPassword.replace(/'/g, "'\\''");
        return `${sshpassCmd} -p '${escapedPassword}' ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no ${server.sshUser}@${server.address} '${remoteCommand.replace(/'/g, "'\\''")}'`;
      } catch (error) {
        console.error('sshpass not available, falling back to key-based auth');
        // Fallback: try with key if available
        if (server.sshKeyPath && existsSync(server.sshKeyPath)) {
          return `ssh -i ${server.sshKeyPath} -o StrictHostKeyChecking=no ${server.sshUser}@${server.address} '${remoteCommand.replace(/'/g, "'\\''")}'`;
        }
        throw new Error('SSH authentication method not available');
      }
    } else {
      // Use SSH key authentication
      if (!server.sshKeyPath || !existsSync(server.sshKeyPath)) {
        throw new Error(`SSH key not found: ${server.sshKeyPath}`);
      }
      return `ssh -i ${server.sshKeyPath} -o StrictHostKeyChecking=no ${server.sshUser}@${server.address} '${remoteCommand.replace(/'/g, "'\\''")}'`;
    }
  }

  /**
   * Add a peer to WireGuard server
   */
  async addPeer(serverId: string, peer: PeerInfo): Promise<{ success: boolean; clientIP?: string; error?: string }> {
    const server = this.servers.get(serverId);
    if (!server) {
      return { success: false, error: `Server ${serverId} not found` };
    }

    try {
      // Get next available IP for this client
      const clientIP = await this.getNextAvailableIP(serverId);
      // Use the allocated IP, not the peer's allowedIPs (which is usually 0.0.0.0/0 for routing)
      const allowedIPs = `${clientIP}/32`;
      const keepalive = peer.persistentKeepalive || 25;

      // Add peer using wg set command
      const addPeerCommand = `wg set wg0 peer ${peer.publicKey} allowed-ips ${allowedIPs} persistent-keepalive ${keepalive}`;
      const sshCommand = this.buildSSHCommand(server, addPeerCommand);
      
      await execAsync(sshCommand, { timeout: 10000 });

      // Update config file to persist the change
      const updateConfigCommand = `cd /etc/wireguard && cat >> wg0.conf << 'EOF'

[Peer]
PublicKey = ${peer.publicKey}
AllowedIPs = ${allowedIPs}
PersistentKeepalive = ${keepalive}
EOF`;
      const updateSSHCommand = this.buildSSHCommand(server, updateConfigCommand);
      await execAsync(updateSSHCommand, { timeout: 10000 });

      console.log(`✅ Added peer ${peer.publicKey.substring(0, 20)}... to server ${serverId} with IP ${clientIP}`);

      return { success: true, clientIP };
    } catch (error: any) {
      console.error(`❌ Failed to add peer to ${serverId}:`, error);
      return { 
        success: false, 
        error: error.message || 'Failed to add peer to server' 
      };
    }
  }

  /**
   * Remove a peer from WireGuard server
   */
  async removePeer(serverId: string, publicKey: string): Promise<{ success: boolean; error?: string }> {
    const server = this.servers.get(serverId);
    if (!server) {
      return { success: false, error: `Server ${serverId} not found` };
    }

    try {
      // Remove peer using wg set command
      const removePeerCommand = `wg set wg0 peer ${publicKey} remove`;
      const sshCommand = this.buildSSHCommand(server, removePeerCommand);
      
      await execAsync(sshCommand, { timeout: 10000 });

      // Remove from config file
      const updateConfigCommand = `cd /etc/wireguard && sed -i '/PublicKey = ${publicKey}/,/^$/d' wg0.conf`;
      const updateSSHCommand = this.buildSSHCommand(server, updateConfigCommand);
      await execAsync(updateSSHCommand, { timeout: 10000 });

      console.log(`✅ Removed peer ${publicKey.substring(0, 20)}... from server ${serverId}`);

      return { success: true };
    } catch (error: any) {
      console.error(`❌ Failed to remove peer from ${serverId}:`, error);
      return { 
        success: false, 
        error: error.message || 'Failed to remove peer from server' 
      };
    }
  }

  /**
   * Check if peer exists on server
   */
  async peerExists(serverId: string, publicKey: string): Promise<boolean> {
    const server = this.servers.get(serverId);
    if (!server) {
      return false;
    }

    try {
      const checkCommand = `wg show wg0 | grep -q '${publicKey}' && echo 'exists' || echo 'not found'`;
      const sshCommand = this.buildSSHCommand(server, checkCommand);
      const { stdout } = await execAsync(sshCommand, { timeout: 10000 });
      
      return stdout.trim() === 'exists';
    } catch (error) {
      console.error(`Failed to check peer existence for ${serverId}:`, error);
      return false;
    }
  }

  /**
   * Get peer information from server
   */
  async getPeerInfo(serverId: string, publicKey: string): Promise<{ allowedIPs?: string; lastHandshake?: string } | null> {
    const server = this.servers.get(serverId);
    if (!server) {
      return null;
    }

    try {
      const infoCommand = `wg show wg0 | grep -A 5 '${publicKey}' | head -6`;
      const sshCommand = this.buildSSHCommand(server, infoCommand);
      const { stdout } = await execAsync(sshCommand, { timeout: 10000 });
      
      const lines = stdout.trim().split('\n');
      const info: { allowedIPs?: string; lastHandshake?: string } = {};
      
      for (const line of lines) {
        if (line.includes('allowed ips')) {
          info.allowedIPs = line.split(':')[1]?.trim();
        }
        if (line.includes('latest handshake')) {
          info.lastHandshake = line.split(':')[1]?.trim();
        }
      }
      
      return Object.keys(info).length > 0 ? info : null;
    } catch (error) {
      console.error(`Failed to get peer info for ${serverId}:`, error);
      return null;
    }
  }
}

export default WireGuardService;

