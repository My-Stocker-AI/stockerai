/**
 * pcm-capture-processor — AudioWorklet that turns the live mic into raw 16 kHz mono
 * Int16 PCM and posts it to the main thread, which streams it to Deepgram.
 *
 * WHY THIS EXISTS: the browser's MediaRecorder emits *containerized* audio (WebM/Opus,
 * MP4/AAC). Deepgram's container header is only present in the first chunk, so any
 * mid-stream reconnect gets header-less fragments it cannot decode — it "hears speech"
 * (VAD fires) but returns zero words, then the socket dies. Raw PCM is headerless, so
 * that whole failure class cannot occur. (Deepgram docs: encoding is for raw/headerless
 * audio only; containerized audio must NOT declare an encoding.)
 *
 * Downsample: nearest-sample decimation from the context rate (typ. 48 kHz on iOS) to
 * 16 kHz — the rate AirPods run at in call-mode and the rate Deepgram wants for voice.
 * A fractional accumulator handles non-integer ratios (e.g. 44.1 kHz → 16 kHz).
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // sampleRate is a global in AudioWorkletGlobalScope (the context's actual rate).
    this._ratio = sampleRate / 16000;
    this._pos = 0; // fractional read position carried across process() blocks
  }

  process(inputs) {
    const input = inputs[0];
    // No input channel this block (mic momentarily silent/absent) — keep the node alive.
    if (!input || !input[0]) return true;
    const ch = input[0]; // Float32Array, values in [-1, 1]

    const out = [];
    let pos = this._pos;
    while (pos < ch.length) {
      let s = ch[Math.floor(pos)];
      // clamp then scale to signed 16-bit
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      out.push(s < 0 ? s * 0x8000 : s * 0x7fff);
      pos += this._ratio;
    }
    // carry the fractional remainder into the next block so pitch/rate stays exact
    this._pos = pos - ch.length;

    if (out.length) {
      const buf = new Int16Array(out);
      // transfer the buffer (zero-copy) to the main thread
      this.port.postMessage(buf.buffer, [buf.buffer]);
    }
    // Output nothing — this node is a silent sink, never routed back to the speaker.
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
