/**
 * Xtream Codes API Ingestion Client
 */
export default class XtreamClient {
  /**
   * @param {string} serverUrl 
   * @param {string} username 
   * @param {string} password 
   */
  constructor(serverUrl, username, password) {
    this.serverUrl = this.sanitizeUrl(serverUrl);
    this.username = username || '';
    this.password = password || '';
  }

  /**
   * Sanitizes the input server URL by trimming and stripping trailing slashes.
   * @param {string} url 
   * @returns {string}
   */
  sanitizeUrl(url) {
    if (!url) return "";
    return url.trim().replace(/\/+$/, "");
  }

  /**
   * Helper to perform fetch requests with a built-in timeout.
   * @param {string} url 
   * @param {number} [timeoutMs=10000] 
   * @returns {Promise<Response>}
   */
  async fetchWithTimeout(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      if (error.name === 'AbortError') {
        throw new Error("Connection timed out. The IPTV server took too long to respond.");
      }
      throw error;
    }
  }

  /**
   * Authenticates the credentials and returns the authenticated user info.
   * Throws a human-readable error if authentication is not successful.
   * @returns {Promise<Object>} The user info block
   */
  async authenticate() {
    if (!this.serverUrl) {
      throw new Error("Server URL is required.");
    }
    const url = `${this.serverUrl}/player_api.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`;
    
    try {
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`IPTV server returned HTTP status: ${response.status}`);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error("Malformed API response. Server did not return valid JSON data.");
      }

      if (!data || !data.user_info) {
        throw new Error("Authentication failed. Invalid server response schema.");
      }

      const info = data.user_info;
      const isAuth = info.auth === 1;
      const isActive = info.status === "Active";

      if (isAuth || isActive) {
        return info;
      }

      if (info.status && info.status !== "Active") {
        throw new Error(`Account status: ${info.status}`);
      }

      throw new Error("Invalid credentials");
    } catch (error) {
      console.error("[XtreamClient] Authentication failed:", error);
      throw error;
    }
  }

  /**
   * Fetches live streams, optionally filtered by category.
   * Maps incoming streams to the unified app schema.
   * @param {string|number} [categoryId]
   * @returns {Promise<Array>}
   */
  async getLiveStreams(categoryId = null) {
    const url = `${this.serverUrl}/player_api.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}&action=get_live_streams`;

    try {
      const response = await this.fetchWithTimeout(url, 15000); // 15s timeout for large channel list fetches
      if (!response.ok) {
        throw new Error(`Failed to fetch streams: HTTP status ${response.status}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        throw new Error("Malformed stream API response. Server did not return valid JSON.");
      }

      if (!Array.isArray(data)) {
        return [];
      }

      let mapped = data.map(item => ({
        id: item.stream_id,
        name: item.name || "Unknown Channel",
        logo: item.stream_icon || '',
        categoryId: item.category_id,
        epgId: item.epg_channel_id || null,
        streamUrl: `${this.serverUrl}/live/${this.username}/${this.password}/${item.stream_id}.ts`,
        catchupAvailable: item.have_catchup === "1" || item.have_catchup === 1,
        catchupDays: parseInt(item.catchup_days, 10) || 0
      }));

      if (categoryId !== null && categoryId !== undefined) {
        const catStr = String(categoryId);
        mapped = mapped.filter(item => String(item.categoryId) === catStr);
      }

      return mapped;
    } catch (error) {
      console.error("[XtreamClient] Failed to fetch live streams:", error);
      throw error;
    }
  }

  /**
   * Fetches EPG listings for a specific stream.
   * @param {string|number} streamId 
   * @returns {Promise<Object|Array>} Raw EPG data or empty array if none exists
   */
  async getShortEPG(streamId) {
    const url = `${this.serverUrl}/player_api.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}&action=get_short_epg&stream_id=${streamId}`;

    try {
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch short EPG: HTTP ${response.status}`);
      }
      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error("[XtreamClient] Failed to fetch short EPG:", error);
      return [];
    }
  }
}
