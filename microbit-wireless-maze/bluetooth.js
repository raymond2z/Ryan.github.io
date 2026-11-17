const UART = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const START_ACCELEROMETER = new TextEncoder().encode("accel\n");

function parseAcceleration(line) {
  const fields = line.trim().split(/\s*,\s*|\s+/);
  if (fields.length < 4 || !fields.slice(0, 4).every(value => /^[+-]?\d+$/.test(value))) return null;
  const [x, y, z] = fields.map(Number);
  if (![x, y, z].every(value => Math.abs(value) <= 16000)) return null;
  return { x: x / 1024, y: y / 1024, z: -z / 1024 };
}

class MicrobitConnection {
  constructor(onStatus, onSample) {
    this.onStatus = onStatus;
    this.onSample = onSample;
    this.device = null;
    this.transmit = null;
    this.receive = null;
    this.watchdog = null;
    this.pendingWrite = false;
    this.lastSample = 0;
    this.lastPacket = 0;
    this.buffer = "";
    this.decoder = new TextDecoder();
    this.handleDisconnect = () => this.close("micro:bit disconnected.");
    this.handleNotification = event => this.readPacket(event.target.value);
  }

  async connect() {
    if (!window.isSecureContext || !navigator.bluetooth) {
      this.onStatus("error", "Open this page in Chrome or Edge with Web Bluetooth over HTTPS or on localhost.");
      return;
    }
    this.onStatus("connecting", "Select your micro:bit in the Bluetooth dialog.");
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "BBC micro:bit" }, { namePrefix: "javalab-mbl" }, { services: [UART] }],
        optionalServices: [UART],
      });
      this.device.addEventListener("gattserverdisconnected", this.handleDisconnect);
      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(UART);
      this.receive = await service.getCharacteristic(UART_TX);
      this.transmit = await service.getCharacteristic(UART_RX);
      this.receive.addEventListener("characteristicvaluechanged", this.handleNotification);
      await this.receive.startNotifications();
      this.onStatus("waiting", "Connected. Waiting for accelerometer readings.");
      await this.requestMeasurements();
      if (this.device) this.watchdog = setInterval(() => this.checkStream(), 1000);
    } catch (error) {
      const message = error.name === "NotFoundError" && !this.device
        ? "No device selected."
        : "Could not connect. Check that MBL v6 is installed and disconnect the board from other tabs.";
      this.close(message, error.name === "NotFoundError" && !this.device ? "idle" : "error");
    }
  }

  async requestMeasurements() {
    if (this.pendingWrite || !this.transmit) return;
    this.pendingWrite = true;
    try {
      if (this.transmit.properties.write) await this.transmit.writeValueWithResponse(START_ACCELEROMETER);
      else await this.transmit.writeValueWithoutResponse(START_ACCELEROMETER);
    } finally {
      this.pendingWrite = false;
    }
  }

  async checkStream() {
    const now = performance.now();
    if (this.lastSample && now - this.lastSample < 1100) return;
    const receiving = this.lastPacket && now - this.lastPacket < 2100;
    this.onStatus("waiting", receiving
      ? "Bluetooth data received. Retrying for accelerometer readings."
      : "Connected. No sensor data yet. Retrying.");
    try {
      await this.requestMeasurements();
    } catch {
      this.close("Could not read the micro:bit. Reconnect to try again.", "error");
    }
  }

  readPacket(value) {
    const chunk = this.decoder.decode(value, { stream: true }).replace(/\0/g, "");
    if (!chunk) return;
    this.lastPacket = performance.now();

    // Javalab can send one complete sample per notification without a line ending.
    const notification = chunk.trim();
    if (!/[\r\n]/.test(notification) && this.emitSample(notification)) {
      this.buffer = "";
      return;
    }

    const lines = (this.buffer + chunk).split(/[\r\n]+/);
    this.buffer = lines.pop();
    for (const line of lines) this.emitSample(line);
    if (this.emitSample(this.buffer) || this.buffer.length > 120 || /[^\d\s,+-]/.test(this.buffer)) this.buffer = "";
  }

  emitSample(text) {
    const acceleration = parseAcceleration(text);
    if (!acceleration) return false;
    this.lastSample = this.lastPacket;
    this.onStatus("ready", "Connected · Receiving readings");
    this.onSample(acceleration, this.lastSample);
    return true;
  }

  close(message = "Bluetooth disconnected", state = "idle") {
    clearInterval(this.watchdog);
    this.watchdog = null;
    this.lastSample = 0;
    this.lastPacket = 0;
    this.buffer = "";
    this.decoder = new TextDecoder();
    this.receive?.removeEventListener("characteristicvaluechanged", this.handleNotification);
    this.device?.removeEventListener("gattserverdisconnected", this.handleDisconnect);
    if (this.device?.gatt.connected) this.device.gatt.disconnect();
    this.receive = null;
    this.transmit = null;
    this.device = null;
    this.onStatus(state, message);
  }
}
